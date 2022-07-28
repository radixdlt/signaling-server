import dotenv from 'dotenv'
dotenv.config()
import { log } from './utils/log'
import { messageFns } from './messages'
import { websocketServer } from './websocket/websocket-server'
import { redisClient } from './data'
import {
  connectedClientsGauge,
  prometheusClient,
  queueSizeGauge,
} from './metrics/metrics'
import './http/http-server'
import { DataChannelRepo } from './data/data-channel-repo'
import { randomUUID } from 'node:crypto'
import { wsRepo } from './data/websocket-repo'
import { ResultAsync } from 'neverthrow'
import { WebSocket } from 'ws'
import {
  bufferTime,
  catchError,
  concatMap,
  filter,
  forkJoin,
  Subject,
  tap,
} from 'rxjs'
import { config } from './config'

const collectDefaultMetrics = prometheusClient.collectDefaultMetrics
collectDefaultMetrics()

type QueueItem = { ws: WebSocket; data: string }

const SimpleQueue = (
  handleIncomingMessage: (
    ws: WebSocket,
    rawMessage: string
  ) => ResultAsync<void, Error>
) => {
  const messageSubject = new Subject<QueueItem>()
  let count = 0

  messageSubject
    .pipe(
      bufferTime(1000, null, config.queue.concurrency),
      filter((items) => items.length > 0),
      concatMap((items) => {
        return forkJoin(
          items.map((item) => {
            return handleIncomingMessage(item.ws, item.data)
              .map(() => {
                --count
              })
              .mapErr((error) => {
                --count
                if (error.message === 'write EPIPE') return
                log.error(error)
              })
          })
        )
      }),
      tap(() => {
        queueSizeGauge.set(count)
        log.trace(`messages in queue: ${count}`)
      }),
      catchError((error) => {
        log.error(error)
        return []
      })
    )
    .subscribe()

  const add = (item: QueueItem) => {
    ++count
    messageSubject.next(item)
  }

  return { add }
}

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

  // const worker = createWorker(wsRepo, handleIncomingMessage)
  const queue = SimpleQueue(handleIncomingMessage)

  wss.on('connection', (ws) => {
    log.debug({ event: `ClientConnected`, clients: wss.clients.size })
    connectedClientsGauge.set(wss.clients.size)

    ws.isAlive = true
    ws.id = randomUUID()
    wsRepo.set(ws.id, ws)

    ws.on('pong', () => {
      ws.isAlive = true
    })

    ws.onmessage = (event) => {
      return queue.add({ ws, data: event.data.toString() })
      // incomingMessageCounter.inc()
      // await messageQueue.add(
      //   randomUUID(),
      //   {
      //     id: ws.id,
      //     data: event.data.toString(),
      //   },
      //   { removeOnComplete: true, removeOnFail: true }
      // )
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
