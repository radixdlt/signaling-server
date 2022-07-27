import dotenv from 'dotenv'
dotenv.config()
import { log } from './utils/log'
import { messageFns } from './messages'
import { websocketServer } from './websocket/websocket-server'
import { redisClient } from './data'
import {
  connectedClientsGauge,
  incomingMessageCounter,
  prometheusClient,
} from './metrics/metrics'
import './http/http-server'
import { DataChannelRepo } from './data/data-channel-repo'
import cluster from 'cluster'
import { spawn } from './spawn'

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

  if (cluster.isPrimary) {
    spawn()
  } else {
    wss.on('connection', (ws) => {
      log.debug({ event: `ClientConnected`, clients: wss.clients.size })
      connectedClientsGauge.set(wss.clients.size)

      ws.isAlive = true

      ws.on('pong', () => {
        ws.isAlive = true
      })

      ws.onmessage = (event) => {
        try {
          incomingMessageCounter.inc()
          handleIncomingMessage(ws, event.data.toString()).mapErr((error) => {
            if (
              [
                'write EPIPE',
                'Cannot call write after a stream was destroyed',
              ].includes(error.message)
            )
              return
            log.error(error)
          })
        } catch (error) {
          log.error(error)
        }
      }

      ws.onerror = (event) => {
        log.error(event.error)
      }

      ws.onclose = () => {
        connectedClientsGauge.set(wss.clients.size)
        log.trace({
          event: 'ClientDisconnected',
          clients: wss.clients.size,
        })
        dataChannelRepo.remove(ws)
      }
    })
  }
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
