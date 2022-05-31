import { log } from './utils/log'
import { messageFns } from './messages'
import { config } from './config'
import { getClientsByConnectionId, websocketServer } from './websocket'
import { v4 } from 'uuid'
import { dataFns, redisClient } from './data'

const server = async () => {
  const redis = redisClient()
  const connection = await redis.connect()
  const wss = websocketServer()
  const getClients = getClientsByConnectionId(wss)
  const dataHandlers = dataFns(
    redis.getData,
    redis.setData,
    redis.publish(config.redis.pubSubDataChannel)
  )
  const { handleIncomingMessage, handleDataChannel } = messageFns(
    dataHandlers,
    config.instanceId,
    getClients
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
    log.trace({ event: `ClientConnected` })

    ws.id = v4()
    ws.isAlive = true

    ws.on('pong', () => {
      ws.isAlive = true
    })

    ws.on('message', async (messageBuffer) => {
      await handleIncomingMessage(ws, messageBuffer)
    })
  })
}

server()
