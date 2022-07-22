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
import { DataChannelRepo } from './data/data-channel-repo'

const collectDefaultMetrics = prometheusClient.collectDefaultMetrics
collectDefaultMetrics()

const server = async () => {
  const redis = await redisClient()
  const dataChannelRepo = DataChannelRepo(redis.createDataChannel)
  const { wss } = websocketServer(dataChannelRepo)

  const { handleIncomingMessage } = messageFns(
    dataChannelRepo,
    redis.getClients,
    redis.addClient,
    redis.publish
  )

  // TODO: handle redis errors
  redis.error$.subscribe((error) => {
    log.error({ errorName: 'RedisError', error: JSON.stringify(error) })
  })

  wss.on('connection', (ws) => {
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
      dataChannelRepo.remove(ws)
    }
  })
}

server().catch((error) => {
  console.error(error)
  log.error(error)
})
