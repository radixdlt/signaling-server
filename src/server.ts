import { log } from './utils/log'
import { messageFns } from './messages'
import { websocketServer } from './websocket/websocket-server'
import { v4 } from 'uuid'
import { redisClient } from './data'
import express from 'express'
import { config } from './config'
import client from 'prom-client'

const collectDefaultMetrics = client.collectDefaultMetrics
collectDefaultMetrics()

const app = express()

app.get('/health', (req, res) => {
  res.send()
})

app.listen(config.healthCheckPort)

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
    log.error({ errorName: 'RedisError', error })
  })

  handleDataChannel(redis.data$).subscribe()

  wss.on('connection', (ws) => {
    log.trace({ event: `ClientConnected`, clientConnected: wss.clients.size })

    ws.id = v4()
    ws.isAlive = true

    ws.on('pong', () => {
      ws.isAlive = true
    })

    ws.on('message', async (messageBuffer) => {
      await handleIncomingMessage(ws, messageBuffer)
    })

    ws.onclose = () => {
      log.info({
        event: 'ClientDisconnected',
        clientConnected: wss.clients.size,
      })
    }
  })
}

server()
