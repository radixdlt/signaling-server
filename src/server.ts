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

  wss.on('connection', (ws) => {
    log.info({ event: `ClientConnected`, clients: wss.clients.size })
    connectedClientsGauge.set(wss.clients.size)

    ws.isAlive = true

    ws.on('pong', () => {
      ws.isAlive = true
    })

    ws.onmessage = async (event) => {
      try {
        incomingMessageCounter.inc()
        await handleIncomingMessage(ws, event.data.toString())
      } catch (error) {
        console.error(error)
      }
    }

    ws.onerror = (event) => {
      log.error(event.error)
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

const runServer = async () => {
  try {
    await server()
  } catch (error) {
    console.error(error)
    await runServer()
  }
}

runServer()
