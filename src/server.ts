import dotenv from 'dotenv'
dotenv.config()
import { log } from './utils/log'
import { messageFns } from './messages'
import { redisClient } from './data'
import {
  connectedClientsGauge,
  incomingMessageCounter,
  prometheusClient,
} from './metrics/metrics'
import './http/http-server'
import { DataChannelRepo } from './data/data-channel-repo'
import { wsRepo } from './data/websocket-repo'
import { config } from './config'
import uWs, { DEDICATED_COMPRESSOR_3KB } from 'uWebSockets.js'
import { randomUUID } from 'node:crypto'

const collectDefaultMetrics = prometheusClient.collectDefaultMetrics
collectDefaultMetrics()

const RateLimit = (limit: number, interval: number) => {
  let now = 0
  const last = Symbol(),
    count = Symbol()
  setInterval(() => ++now, interval)
  return (ws: any) => {
    if (ws[last] != now) {
      ws[last] = now
      ws[count] = 1
    } else {
      return ++ws[count] > limit
    }
  }
}

// const rateLimit = RateLimit(config.rateLimit.messages, config.rateLimit.time)

let connections = 0

const server = async () => {
  const redis = await redisClient()

  const dataChannelRepo = DataChannelRepo(redis.createDataChannel)
  // const { wss } = websocketServer(dataChannelRepo, wsRepo)

  const { handleIncomingMessage } = messageFns(
    dataChannelRepo,
    redis.getClients,
    redis.addClient,
    redis.publish
  )

  const wws = uWs
    .App()
    .ws('/*', {
      // maxPayloadLength: 512,
      // compression: DEDICATED_COMPRESSOR_3KB,
      upgrade: (res, req, context) => {
        res.upgrade(
          {
            ip: res.getRemoteAddressAsText(),

            url: new URL(`https://x.cc${req.getUrl()}?${req.getQuery()}`),
          }, // 1st argument sets which properties to pass to ws object, in this case ip address
          req.getHeader('sec-websocket-key'),
          req.getHeader('sec-websocket-protocol'),
          req.getHeader('sec-websocket-extensions'), // 3 headers are used to setup websocket
          context // also used to setup websocket
        )
      },
      open: async (ws) => {
        ++connections
        connectedClientsGauge.set(connections)
        const url: URL = ws.url
        const connectionId = url.pathname.slice(1)
        const target = url.searchParams.get('target')
        if (!connectionId) {
          return ws.end(1003, 'missing connectionId in path')
        }
        if (!target) {
          return ws.end(1003, 'missing target')
        }
        if (!['iOS', 'extension'].includes(target)) {
          return ws.end(1003, 'invalid target')
        }
        const id = randomUUID()
        ws.id = id
        ws.connectionId = connectionId

        await redis.subscriber.subscribe(id, (message) => ws.send(message))
        await redis.publisher.set(`${connectionId}:${target}`, id)
      },
      message: async (ws, arrayBuffer) => {
        try {
          // incomingMessageCounter.inc()

          const t0 = performance.now()
          const rawMessage = Buffer.from(arrayBuffer).toString('utf8')
          const parsed = JSON.parse(rawMessage)
          const clientId = await redis.publisher.get(
            `${ws.connectionId}:${parsed.source}`
          )
          const t1 = performance.now()

          console.log('Block 1 took ' + (t1 - t0) + ' milliseconds.')

          const t2 = performance.now()
          if (clientId) {
            await redis.publisher.publish(clientId, rawMessage)
          }
          const t3 = performance.now()

          console.log('Block 2 took ' + (t3 - t2) + ' milliseconds.')

          const t4 = performance.now()
          ws.send(JSON.stringify({ valid: rawMessage }))
          const t5 = performance.now()
          console.log('Block 3 took ' + (t5 - t4) + ' milliseconds.')
          console.log('Total time ' + (t5 - t0) + ' milliseconds.')
        } catch (error) {
          log.error(error)
        }

        // redis.publisher()
        // const dataChannelId = dataChannelRepo.getId(ws)

        // if (!dataChannelId) {
        //   await dataChannelRepo.add(ws, ws.send)
        // }

        // ws.send(message)
        // return message
        // incomingMessageCounter.inc()
        // if (rateLimit(ws)) {
        //   ws.send(
        //     JSON.stringify({
        //       action: 'info',
        //       data: 'over limit! please slow down.',
        //     })
        //   )
        //   return ws.end(1008, 'Too Many Requests')
        // }
        // try {
        //   handleIncomingMessage(
        //     ws,
        //     Buffer.from(message).toString('utf8')
        //   ).mapErr((error) => {
        //     if (!error || (error && error.message === 'write EPIPE')) return
        //     log.error(error)
        //   })
        // } catch (error: any) {
        //   if (
        //     error.message ===
        //     'Invalid access of closed uWS.WebSocket/SSLWebSocket.'
        //   )
        //     return
        //   log.error(error)
        // }
      },
      drain: (ws) => {
        console.log('WebSocket backpressure: ' + ws.getBufferedAmount())
      },
      close: async (ws, code, message) => {
        --connections
        connectedClientsGauge.set(connections)
        await redis.subscriber.unsubscribe(ws.id)
        // log.trace({
        //   event: 'ClientDisconnected',
        //   clients: wss.clients.size,
        // })
        // dataChannelRepo.remove(ws)
        // wsRepo.delete(ws.id)
      },
    })
    .listen(config.port, (token) => {
      if (token) {
        console.log('Listening to port ' + config.port)
      } else {
        console.log('Failed to listen to port ' + config.port)
      }
    })

  // wss.on('connection', (ws) => {
  //   log.debug({ event: `ClientConnected`, clients: wss.clients.size })
  //   connectedClientsGauge.set(wss.clients.size)

  //   ws.isAlive = true
  //   ws.id = randomUUID()
  //   wsRepo.set(ws.id, ws)

  //   ws.on('pong', () => {
  //     ws.isAlive = true
  //   })

  //   ws.onmessage = async (event) => {
  //     // queue.add({ ws, data: event.data.toString() })
  //     // incomingMessageCounter.inc()
  //     // incomingMessageCounter.inc()
  //     // await messageQueue.add(
  //     //   randomUUID(),
  //     //   {
  //     //     id: ws.id,
  //     //     data: event.data.toString(),
  //     //   },
  //     //   { removeOnComplete: true, removeOnFail: true }
  //     // )
  //     incomingMessageCounter.inc()
  //     if (!wsRepo.has(ws.id)) {
  //       return
  //     }
  //     try {
  //       const result = await handleIncomingMessage(ws, event.data.toString())
  //       if (result.isErr()) {
  //         const error = result.error
  //         if (error.message === 'write EPIPE') return
  //         log.error(error)
  //       }
  //     } catch (error) {
  //       console.error(error)
  //     }
  //   }

  //   ws.onerror = (event) => {
  //     log.error(event.error)
  //   }

  //   ws.onclose = async () => {
  //     connectedClientsGauge.set(wss.clients.size)
  //     log.trace({
  //       event: 'ClientDisconnected',
  //       clients: wss.clients.size,
  //     })
  //     await dataChannelRepo.remove(ws)
  //     wsRepo.delete(ws.id)
  //   }
  // })
}

const runServer = async () => {
  try {
    await server()
  } catch (error) {
    console.error(error)
    await runServer()
  }
}

runServer()
