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
import { wsRepo } from './data/websocket-repo'
import { config } from './config'
import uWs from 'uWebSockets.js'
import { randomUUID } from 'node:crypto'
import { parseJSON, checkIfValidSHA256 } from './utils/utils'
import { rateLimit } from './utils/rate-limit'
import {
  MessageTypes,
  RemoteClientIsAlreadyConnected,
  RemoteClientJustConnected,
  RemoteClientDisconnected,
  RemoteData,
} from './messages/_types'

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
    message:
      | RemoteData
      | RemoteClientIsAlreadyConnected
      | RemoteClientJustConnected
      | RemoteClientDisconnected
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
    await redis.publisher.set(`${connectionId}:${target}`, id, { EX: 86_400 })
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
      parseJSON<
        | RemoteData
        | RemoteClientIsAlreadyConnected
        | RemoteClientJustConnected
        | RemoteClientDisconnected
      >(raw).map((message) => {
        outgoingMessageCounter.inc()
        send(ws, message)
      })
    })
    const t1 = performance.now()
    redisSubscribeTime.set(t1 - t0)
  }

  const send = (
    ws: uWs.WebSocket,
    message: MessageTypes | RemoteClientIsAlreadyConnected
  ) => {
    try {
      ws.send(JSON.stringify(message))
      outgoingMessageCounter.inc()
    } catch (error) {
      if (
        (error as Error).message ===
        'Invalid access of closed uWS.WebSocket/SSLWebSocket.'
      )
        return
      log.error(error)
    }
  }

  Bun.serve({
    port: config.port,
    fetch(req, server) {
      if (req.url.includes('/health')) {
        return new Response('ok')
      } else if (req.url.includes('/metrics')) {
        return prometheusClient.register
          .metrics()
          .then((metrics) => new Response(metrics))
      }

      if (
        server.upgrade(req, {
          data: {
            url: new URL(req.url),
          },
        })
      )
        return

      return new Response('Regular HTTP response')
    },
    websocket: {
      open: async (ws) => {
        try {
          ++connections
          connectedClientsGauge.set(connections)
          const url: URL = ws.data.url
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

          const [, , targetClientId] = await Promise.all([
            subscribe(ws, id),
            setData(connectionId, target, id),
            getTargetClientId(ws.targetClientIdKey),
          ])

          if (targetClientId) {
            await publish(targetClientId, {
              info: 'remoteClientJustConnected',
            })
            send(ws, { info: 'remoteClientIsAlreadyConnected' })
          }

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
          const rawMessage: string = Buffer.from(arrayBuffer).toString('utf8')
          const parsedResult = parseJSON<Message>(rawMessage)

          if (parsedResult.isErr()) {
            return send(ws, {
              info: 'invalidMessageError',
              data: rawMessage,
              error: 'invalid message format, expected JSON',
            })
          }

          const parsed = parsedResult.value

          const validateResult = await validateMessage(parsed)

          if (validateResult.isErr()) {
            return send(ws, {
              info: 'validationError',
              requestId: parsed?.requestId,
              error: validateResult.error,
            })
          }

          const targetClientWebsocket = wsRepo.get(ws.targetClientId)

          if (targetClientWebsocket) {
            send(targetClientWebsocket, {
              info: 'remoteData',
              data: parsed,
              requestId: parsed.requestId,
            })
          } else {
            const targetClientId = await getTargetClientId(ws.targetClientIdKey)

            if (targetClientId) {
              ws.targetClientId = targetClientId
              await publish(targetClientId, {
                info: 'remoteData',
                data: parsed,
                requestId: parsed.requestId,
              })
            } else {
              return send(ws, {
                info: 'missingRemoteClientError',
                requestId: parsed.requestId,
              })
            }
          }

          send(ws, { info: 'confirmation', requestId: parsed.requestId })
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
          if (ws.id) {
            const targetClientId = await getTargetClientId(ws.targetClientIdKey)
            if (targetClientId) {
              await publish(targetClientId, {
                info: 'remoteClientDisconnected',
              })
            }
            await Promise.all([
              redis.subscriber.unsubscribe(ws.id),
              removeData(ws.connectionId, ws.target),
            ])

            wsRepo.delete(ws.id)
          }

          log.trace({
            event: 'ClientDisconnected',
            clients: connections,
          })
        } catch (error) {
          log.error(error)
        }
      },
    },
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
