import dotenv from 'dotenv'
dotenv.config()
import { log } from './utils/log'
import { validateMessage } from './messages'
import { redisClient } from './data'
import {
  connectedClientsGauge,
  incomingMessageCounter,
  outgoingMessageCounter,
  prometheusClient,
} from './metrics/metrics'
import './http/http-server'
import { wsRepo } from './data/websocket-repo'
import { config } from './config'
import uWs from 'uWebSockets.js'
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

  uWs
    .App()
    .ws('/*', {
      upgrade: (res, req, context) => {
        res.upgrade(
          {
            ip: res.getRemoteAddressAsText(),
            url: new URL(`https://x.cc${req.getUrl()}?${req.getQuery()}`),
          },
          req.getHeader('sec-websocket-key'),
          req.getHeader('sec-websocket-protocol'),
          req.getHeader('sec-websocket-extensions'),
          context
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
        wsRepo.set(id, ws)
      },
      message: async (ws, arrayBuffer) => {
        try {
          incomingMessageCounter.inc()

          const t0 = performance.now()
          const rawMessage = Buffer.from(arrayBuffer).toString('utf8')
          const parsed = JSON.parse(rawMessage)

          const validateResult = await validateMessage(parsed)
          if (validateResult.isErr()) {
            outgoingMessageCounter.inc()
            return ws.send(JSON.stringify(validateResult.error))
          }

          const targetClientWebsocket = wsRepo.get(ws.targetClientId)

          const t1 = performance.now()
          console.log('Block 1 took ' + (t1 - t0) + ' milliseconds.')

          const t2 = performance.now()

          if (targetClientWebsocket) {
            outgoingMessageCounter.inc()
            targetClientWebsocket.send(rawMessage)
          } else {
            const t0Redis = performance.now()
            const targetClientId = await redis.publisher.get(
              `${ws.connectionId}:${parsed.source}`
            )
            const t1Redis = performance.now()
            console.log(
              'Redis get took ' + (t1Redis - t0Redis) + ' milliseconds.'
            )
            if (targetClientId) {
              ws.targetClientId = targetClientId
              await redis.publisher.publish(targetClientId, rawMessage)
              const t2Redis = performance.now()
              console.log(
                'Redis publish took ' + (t2Redis - t1Redis) + ' milliseconds.'
              )
            }
          }

          outgoingMessageCounter.inc()
          ws.send(JSON.stringify({ valid: rawMessage }))
          const t3 = performance.now()
          console.log('Block 2 took ' + (t3 - t2) + ' milliseconds.')
          console.log('Total time ' + (t3 - t0) + ' milliseconds.')
        } catch (error) {
          log.error(error)
        }
      },
      drain: (ws) => {
        log.trace('WebSocket backpressure: ' + ws.getBufferedAmount())
      },
      close: async (ws) => {
        --connections
        connectedClientsGauge.set(connections)
        await redis.subscriber.unsubscribe(ws.id)
        wsRepo.delete(ws.id)
        log.trace({
          event: 'ClientDisconnected',
          clients: connections,
        })
      },
    })
    .listen(config.port, (token) => {
      if (token) {
        console.log('Listening to port ' + config.port)
      } else {
        console.log('Failed to listen to port ' + config.port)
      }
    })
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
