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
import { createWorker, messageQueue } from './data/message-queue'
import { randomUUID } from 'node:crypto'
import { wsRepo } from './data/websocket-repo'

const collectDefaultMetrics = prometheusClient.collectDefaultMetrics
collectDefaultMetrics()

const server = async () => {
  const redis = await redisClient()

  const dataChannelRepo = DataChannelRepo(redis.createDataChannel)
  const { wss } = websocketServer(dataChannelRepo, wsRepo)

  const { handleIncomingMessage } = messageFns(
    dataChannelRepo,
    redis.getClients,
    redis.addClient,
    redis.publish
  )

  const worker = createWorker(wsRepo, handleIncomingMessage)

  wss.on('connection', (ws) => {
    log.debug({ event: `ClientConnected`, clients: wss.clients.size })
    connectedClientsGauge.set(wss.clients.size)

    ws.isAlive = true
    ws.id = randomUUID()
    wsRepo.set(ws.id, ws)

    ws.on('pong', () => {
      ws.isAlive = true
    })

    ws.onmessage = async (event) => {
      incomingMessageCounter.inc()
      await messageQueue.add(
        randomUUID(),
        {
          id: ws.id,
          data: event.data.toString(),
        },
        { removeOnComplete: true, removeOnFail: true }
      )
      // try {
      //   incomingMessageCounter.inc()
      //   const result = await handleIncomingMessage(ws, event.data.toString())
      //   if (result.isErr()) {
      //     const error = result.error
      //     if (error.message === 'write EPIPE') return
      //     log.error(error)
      //   }
      // } catch (error) {
      //   console.error(error)
      // }
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
      wsRepo.delete(ws.id)
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
