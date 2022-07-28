import { log } from '../utils/log'
import { Queue, Worker } from 'bullmq'
import { config } from '../config'
import IORedis from 'ioredis'
import { WebSocket } from 'ws'
import { ResultAsync } from 'neverthrow'
import { queueSizeGauge, queueActiveJobsGauge } from '../metrics/metrics'

const connection = new IORedis({
  port: config.redis.port,
  host: config.redis.pub_host,
  password: config.redis.password,
})

const queueName = `${config.instanceId}-messages`

const updateExpiration = async () => {
  const now = Date.now()
  const expireAt = now + config.queue.expirationTime
  log.trace(
    `redis keys for queue '${queueName}' will expire at: ${expireAt}, current time: ${now}`
  )
  await Promise.all([
    connection.expireat(`bull:${queueName}:events`, expireAt),
    connection.expireat(`bull:${queueName}:id`, expireAt),
    connection.expireat(`bull:${queueName}:meta`, expireAt),
  ])
}

setInterval(async () => {
  try {
    await updateExpiration()
  } catch (error) {
    log.error(`could not update redis key expiration for: ${queueName}`)
  }
}, config.queue.intervalTime)

setInterval(async () => {
  try {
    const jobs = await messageQueue.getJobCounts()
    queueSizeGauge.set(jobs.waiting + jobs.active)
    queueActiveJobsGauge.set(jobs.active)
  } catch (error) {}
}, 10_000)

export const messageQueue = new Queue(queueName, {
  connection,
})

export const createWorker = (
  wsRepo: Map<string, WebSocket>,
  handleIncomingMessage: (
    ws: WebSocket,
    rawMessage: string
  ) => ResultAsync<void, Error>
) => {
  updateExpiration()
  return new Worker<{ id: string; data: string }>(
    queueName,
    async (job) => {
      const ws = wsRepo.get(job.data.id)
      if (ws) {
        const result = await handleIncomingMessage(ws, job.data.data)
        if (result.isErr()) {
          const error = result.error
          if (error.message === 'write EPIPE') return
          log.error(error)
        }
      }
    },
    { connection, concurrency: config.queue.concurrency }
  )
}
