import dotenv from 'dotenv'
dotenv.config()
import { log } from './utils/log'
import { Message, validateMessage } from './messages'
import { redisClient } from './data'
import {
  connectedClientsGauge,
  incomingMessageCounter,
  outgoingMessageCounter,
  prometheusClient,
  redisDeleteTime,
  redisGetKeyTime,
  redisPublishTime,
  redisSetTime,
  redisSubscribeTime,
} from './metrics/metrics'
import './http/http-server'
import { wsRepo } from './data/websocket-repo'
import { config } from './config'
import uWs from 'uWebSockets.js'
import { randomUUID } from 'node:crypto'
import { parseJSON, checkIfValidSHA256 } from './utils/utils'
import { rateLimit } from './utils/rate-limit'
import { MessageTypes } from './messages/_types'

const collectDefaultMetrics = prometheusClient.collectDefaultMetrics
collectDefaultMetrics()

let connections = 0

const includesSource = (value: string) =>
  ['wallet', 'extension'].includes(value)

const server = async () => {
  const redis = await redisClient()

  const getTargetClientId = async (targetClientIdKey: string) => {
    const t0 = performance.now()
    const clientId = await redis.publisher.get(targetClientIdKey)
    const t1 = performance.now()
    redisGetKeyTime.set(t1 - t0)
    return clientId
  }

  const publish = async (
    dataChanel: string,
    message: MessageTypes | string
  ) => {
    const t0 = performance.now()
    await redis.publish(
      dataChanel,
      typeof message === 'string' ? message : JSON.stringify(message)
    )
    const t1 = performance.now()
    redisPublishTime.set(t1 - t0)
  }

  const setData = async (connectionId: string, target: string, id: string) => {
    const t0 = performance.now()
    await redis.publisher.set(`${connectionId}:${target}`, id)
    const t1 = performance.now()
    redisSetTime.set(t1 - t0)
  }

  const removeData = async (connectionId: string, target: string) => {
    const t0 = performance.now()
    await redis.publisher.del(`${connectionId}:${target}`)
    const t1 = performance.now()
    redisDeleteTime.set(t1 - t0)
  }

  const subscribe = async (ws: uWs.WebSocket, dataChanel: string) => {
    const t0 = performance.now()
    await redis.subscriber.subscribe(dataChanel, (raw) => {
      parseJSON<Message>(raw).map((message) => {
        outgoingMessageCounter.inc()
        send(ws, {
          info: 'RemoteData',
          data: message,
          requestId: message.requestId,
        })
      })
    })
    const t1 = performance.now()
    redisSubscribeTime.set(t1 - t0)
  }

  const send = (ws: uWs.WebSocket, message: MessageTypes) => {
    try {
      ws.send(JSON.stringify(message))
      outgoingMessageCounter.inc()
    } catch (error) {
      log.error(error)
    }
  }

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
        try {
          ++connections
          connectedClientsGauge.set(connections)
          const url: URL = ws.url
          const connectionId = url.pathname.slice(1)
          const target = url.searchParams.get('target')
          const source = url.searchParams.get('source')

          if (!checkIfValidSHA256(connectionId)) {
            return ws.end(1003, 'missing connectionId in path')
          }
          if (!target) {
            return ws.end(1003, 'missing target')
          }
          if (!includesSource(target)) {
            return ws.end(1003, 'invalid target')
          }
          if (!source) {
            return ws.end(1003, 'missing source')
          }
          if (!includesSource(source)) {
            return ws.end(1003, 'invalid source')
          }
          if (source === target) {
            return ws.end(1003, `source and target needs to be different`)
          }
          const id = randomUUID()
          ws.id = id
          ws.connectionId = connectionId
          ws.target = target
          ws.targetClientIdKey = `${ws.connectionId}:${source}`

          await Promise.all([
            subscribe(ws, id),
            setData(connectionId, target, id),
          ])

          wsRepo.set(id, ws)
        } catch (error) {
          log.error(error)
          ws.end(1011, 'could not handle connection, try again')
        }
      },
      message: async (ws, arrayBuffer) => {
        try {
          if (rateLimit(ws)) {
            return ws.end(1013, 'rate limit hit, slow down')
          }
          incomingMessageCounter.inc()
          const rawMessage = Buffer.from(arrayBuffer).toString('utf8')
          const parsedResult = parseJSON<Message>(rawMessage)

          if (parsedResult.isErr()) {
            return send(ws, {
              info: 'InvalidMessageError',
              data: rawMessage,
              error: 'invalid message format, expected JSON',
            })
          }

          const parsed = parsedResult.value

          const validateResult = await validateMessage(parsed)

          if (validateResult.isErr()) {
            return send(ws, {
              info: 'ValidationError',
              requestId: parsed?.requestId,
              error: validateResult.error,
            })
          }

          const targetClientWebsocket = wsRepo.get(ws.targetClientId)

          if (targetClientWebsocket) {
            send(targetClientWebsocket, {
              info: 'RemoteData',
              data: parsed,
              requestId: parsed.requestId,
            })
          } else {
            const targetClientId = await getTargetClientId(ws.targetClientIdKey)

            if (targetClientId) {
              ws.targetClientId = targetClientId
              await publish(targetClientId, rawMessage)
            } else {
              return send(ws, {
                info: 'MissingRemoteClientError',
                requestId: parsed.requestId,
              })
            }
          }

          send(ws, { info: 'Confirmation', requestId: parsed.requestId })
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
        try {
          const targetClientId = await getTargetClientId(ws.targetClientIdKey)
          if (targetClientId) {
            await publish(targetClientId, {
              info: 'RemoteClientDisconnected',
              target: ws.target,
            })
          }

          await Promise.all([
            redis.subscriber.unsubscribe(ws.id),
            removeData(ws.connectionId, ws.target),
          ])

          wsRepo.delete(ws.id)
          log.trace({
            event: 'ClientDisconnected',
            clients: connections,
          })
        } catch (error) {
          log.error(error)
        }
      },
    })
    .listen(config.port, (token) => {
      if (token) {
        log.info('Listening to port ' + config.port)
      } else {
        log.info('Failed to listen to port ' + config.port)
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
