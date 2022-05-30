import { redisClient } from './redis'
import { log } from './log'
import { handleDataChannel, handleIncomingMessage, Response } from './messages'
import { config } from './config'
import { ErrorName } from './error'
import { websocketServer } from './websocketServer'
import { v4 } from 'uuid'

const app = async () => {
  const redis = redisClient()
  const connection = await redis.connect()
  const wss = websocketServer()

  // A redis connection error at this point is most likely caused by a misconfiguration
  if (connection.isErr()) {
    throw connection.error
  }

  // TODO: handle redis errors
  redis.error$.subscribe((error) => {
    log.error({ errorName: 'RedisError', error })
  })

  handleDataChannel({
    wss,
    getData: redis.getData,
    instanceId: config.instanceId,
  })(redis.data$).subscribe()

  wss.on('connection', (ws) => {
    log.trace({ event: `ClientConnected` })

    ws.id = v4()
    ws.isAlive = true

    ws.on('pong', () => {
      ws.isAlive = true
    })

    ws.on('message', async (messageBuffer) => {
      await handleIncomingMessage({
        getData: redis.getData,
        setData: redis.setData,
        publish: (connectionId: string) => {
          const message = {
            connectionId,
            instanceId: config.instanceId,
            clientId: ws.id,
          }
          log.trace({ event: 'Publish', message })
          return redis.publish(config.redis.pubSubDataChannel)(
            JSON.stringify(message)
          )
        },
        send: (response: Response) => {
          log.trace({ event: 'Send', response })
          return ws.send(JSON.stringify(response))
        },
        ws,
      })(messageBuffer)
    })
  })
}

app()
