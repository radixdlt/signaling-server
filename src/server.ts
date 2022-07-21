import { log } from './utils/log'
import { messageFns } from './messages'
import { websocketServer } from './websocket/websocket-server'
import { v4 } from 'uuid'
import { redisClient, clientRepo } from './data'
import {
  connectedClientsGauge,
  incomingMessageCounter,
  prometheusClient,
} from './metrics/metrics'
import './http/http-server'
import {} from 'data/client-repo'

const collectDefaultMetrics = prometheusClient.collectDefaultMetrics
collectDefaultMetrics()

const server = async () => {
  const redis = await redisClient()
  const { wss } = websocketServer()
  const { handleIncomingMessage } = messageFns(
    redis.createDataChannel,
    redis.getClients,
    redis.addClient,
    redis.publish
  )

  // TODO: handle redis errors
  redis.error$.subscribe((error) => {
    log.error({ errorName: 'RedisError', error: JSON.stringify(error) })
  })

  wss.on('connection', (ws) => {
    ws.id = v4()
    log.info({ event: `ClientConnected`, clients: wss.clients.size, id: ws.id })
    connectedClientsGauge.set(wss.clients.size)

    ws.isAlive = true

    ws.on('pong', () => {
      ws.isAlive = true
    })

    ws.onmessage = async (event) => {
      incomingMessageCounter.inc()
      await handleIncomingMessage(ws, event.data.toString())
    }

    ws.onerror = (event) => {
      log.error(event)
    }

    ws.onclose = () => {
      connectedClientsGauge.set(wss.clients.size)
      log.info({
        event: 'ClientDisconnected',
        clients: wss.clients.size,
      })
      if (ws.removeDataChanel) {
        ws.removeDataChanel()
      }
      clientRepo.remove(ws.connectionId, ws.id)
    }
  })
}

try {
  server()
} catch (error) {
  log.error(error)
  throw error
}
