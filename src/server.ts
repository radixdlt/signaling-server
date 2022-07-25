import { log } from './utils/log'
import { messageFns } from './messages'
import { websocketServer } from './websocket/websocket-server'
import { v4 } from 'uuid'
import { redisClient } from './data'
import {
  connectedClientsGauge,
  incomingMessageCounter,
  prometheusClient,
} from './metrics/metrics'
import './http/http-server'

const collectDefaultMetrics = prometheusClient.collectDefaultMetrics
collectDefaultMetrics()

const server = async () => {
  const redis = redisClient()
  const connection = await redis.connect()
  const { wss, getClientsByConnectionId } = websocketServer()
  const { handleIncomingMessage, handleDataChannel } = messageFns(
    redis.publish,
    getClientsByConnectionId
  )

  // A redis connection error at this point is most likely caused by a misconfiguration
  if (connection.isErr()) {
    throw connection.error
  }

  // TODO: handle redis errors
  redis.error$.subscribe((error) => {
    log.error({ errorName: 'RedisError', error: JSON.stringify(error) })
  })

  handleDataChannel(redis.data$).subscribe()

  wss.on('connection', (ws) => {
    log.trace({ event: `ClientConnected`, clients: wss.clients.size })
    connectedClientsGauge.set(wss.clients.size)

    ws.id = v4()
    ws.isAlive = true

    ws.on('pong', () => {
      ws.isAlive = true
    })

    ws.on('message', async (messageBuffer) => {
      incomingMessageCounter.inc()
      try {
        await handleIncomingMessage(ws, messageBuffer)
      } catch (error) {
        log.error(error)
      }
    })

    ws.onerror = (event) => {
      log.error(event)
    }

    ws.onclose = () => {
      connectedClientsGauge.set(wss.clients.size)
      log.trace({
        event: 'ClientDisconnected',
        clients: wss.clients.size,
      })
    }
  })
}

server().catch((error) => {
  console.error(error)
  log.error(error)
})
