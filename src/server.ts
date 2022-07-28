import dotenv from 'dotenv'
dotenv.config()
import { log } from './utils/log'
import { messageFns } from './messages'
import { redisClient } from './data'
import { incomingMessageCounter, prometheusClient } from './metrics/metrics'
import './http/http-server'
import { DataChannelRepo } from './data/data-channel-repo'
import { wsRepo } from './data/websocket-repo'
import { config } from './config'
import uWs from 'uWebSockets.js'

const collectDefaultMetrics = prometheusClient.collectDefaultMetrics
collectDefaultMetrics()

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

  const wss = uWs
    .App()
    .ws('/*', {
      open: (ws) => {},
      message: async (ws, message, isBinary) => {
        incomingMessageCounter.inc()
        try {
          const result = await handleIncomingMessage(
            ws,
            Buffer.from(message).toString('utf8')
          )
          if (result.isErr()) {
            const error = result.error
            if (error.message === 'write EPIPE') return
            log.error(error)
          }
        } catch (error: any) {
          if (
            error.message ===
            'Invalid access of closed uWS.WebSocket/SSLWebSocket.'
          )
            return
          log.error(error)
        }
      },
      drain: (ws) => {
        console.log('WebSocket backpressure: ' + ws.getBufferedAmount())
      },
      close: async (ws, code, message) => {
        // connectedClientsGauge.set(wss.numSubscribers)
        // log.trace({
        //   event: 'ClientDisconnected',
        //   clients: wss.clients.size,
        // })
        await dataChannelRepo.remove(ws)
        wsRepo.delete(ws.id)
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
