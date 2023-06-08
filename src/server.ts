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

type Data = {
  id: string
  connectionId: string
  source: string
  targetClient: string
}

const collectDefaultMetrics = prometheusClient.collectDefaultMetrics
collectDefaultMetrics()

let connections = 0

const includesSource = (value: string) =>
  ['wallet', 'extension'].includes(value)

const server = async () => {
  const redis = await redisClient()

  const getTargetWebsocketIds = async (targetClientIdKey: string) => {
    const t0 = performance.now()
    const clientIds = await redis.publisher.sMembers(targetClientIdKey)
    const t1 = performance.now()
    redisGetKeyTime.set(t1 - t0)
    return clientIds
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

  const setData = async (key: string, value: string) => {
    const t0 = performance.now()
    await redis.publisher.sAdd(key, value)
    await redis.publisher.expire(key, 43_200)
    const t1 = performance.now()
    redisSetTime.set(t1 - t0)
  }

  const removeData = async (key: string, value: string) => {
    const t0 = performance.now()
    await redis.publisher.sRem(key, value)
    const t1 = performance.now()
    redisDeleteTime.set(t1 - t0)
  }

  const isMember = async (key: string, value: string) => {
    return !!(await redis.publisher.sIsMember(key, value))
  }

  const subscribe = async (ws: uWs.WebSocket<any>, dataChanel: string) => {
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

  const send = (ws: uWs.WebSocket<any>, message: MessageTypes) => {
    try {
      log.trace({
        event: 'SendWSMessage',
        message: message,
      })
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

  uWs
    .App()
    .ws('/*', {
      sendPingsAutomatically: true,
      idleTimeout: 0,
      maxLifetime: 0,
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
      open: async (ws: uWs.WebSocket<Data>) => {
        try {
          console.log(ws)
          ++connections
          connectedClientsGauge.set(connections)
          const url: URL = (ws as any).url
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

          const websocketId = randomUUID()
          ws.getUserData().id = websocketId
          ws.getUserData().connectionId = connectionId
          ws.getUserData().source = source
          ws.getUserData().targetClient = `${connectionId}:${target}`

          const [, , targetWebsocketIds] = await Promise.all([
            subscribe(ws, websocketId),
            setData(`${connectionId}:${source}`, websocketId),
            getTargetWebsocketIds(ws.getUserData().targetClient),
          ])

          log.trace({
            event: 'remoteClientsConnected',
            targetWebsocketIds,
          })

          if (targetWebsocketIds && targetWebsocketIds.length > 0) {
            await Promise.all(
              targetWebsocketIds.map((targetWebsocketId) => {
                send(ws, {
                  info: 'remoteClientIsAlreadyConnected',
                  remoteClientId: targetWebsocketId,
                })

                return publish(targetWebsocketId, {
                  info: 'remoteClientJustConnected',
                  remoteClientId: websocketId,
                })
              })
            )
          }
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

          if (
            await isMember(ws.getUserData().targetClient, parsed.targetClientId)
          ) {
            await publish(parsed.targetClientId, {
              info: 'remoteData',
              data: parsed,
              remoteClientId: ws.getUserData().id,
              requestId: parsed.requestId,
            })
          } else {
            return send(ws, {
              info: 'missingRemoteClientError',
              requestId: parsed.requestId,
            })
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
          if (ws.getUserData().id) {
            const targetWebsocketIds = await getTargetWebsocketIds(
              ws.getUserData().targetClient
            )
            if (targetWebsocketIds && targetWebsocketIds.length) {
              await Promise.all(
                targetWebsocketIds.map((targetWebsocketId) =>
                  publish(targetWebsocketId, {
                    info: 'remoteClientDisconnected',
                    remoteClientId: ws.getUserData().id,
                  })
                )
              )
            }

            await Promise.all([
              redis.subscriber.unsubscribe(ws.getUserData().id),
              removeData(
                `${ws.getUserData().connectionId}:${ws.getUserData().source}`,
                ws.getUserData().id
              ),
            ])
          }

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
