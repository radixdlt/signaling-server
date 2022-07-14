import { log } from '../utils/log'
import { createClient } from '@redis/client'
import { config } from '../config'
import { Subject } from 'rxjs'
import { combine, ResultAsync } from 'neverthrow'

export const redisClient = () => {
  const subscriber = createClient({
    url: `redis://${config.redis.sub_host}:${config.redis.port}`,
    password: config.redis.password,
  })
  const publisher = createClient({
    url: `redis://${config.redis.pub_host}:${config.redis.port}`,
    password: config.redis.password,
  })

  const errorSubject = new Subject<any>()
  const dataSubject = new Subject<string>()

  subscriber.on('error', (err) => {
    errorSubject.next(err)
  })

  publisher.on('error', (err) => {
    errorSubject.next(err)
  })

  const publish = (
    channel: string,
    message: string
  ): ResultAsync<void, Error> =>
    ResultAsync.fromPromise(
      publisher.publish(channel, message),
      (e) => e as Error
    ).map((r) => undefined)

  const connectClient = (
    name: string,
    redisClient: ReturnType<typeof createClient>
  ) =>
    ResultAsync.fromPromise(redisClient.connect(), (e) => e as Error).map(
      () => {
        log.trace({ event: 'OpenRedisConnection', clientName: name })
      }
    )

  const connect = () =>
    combine([
      connectClient('publisher', publisher),
      connectClient('subscriber', subscriber),
    ]).map(() => {
      subscriber.subscribe(config.redis.pubSubDataChannel, (connectionId) => {
        dataSubject.next(connectionId)
      })
    })

  return {
    connect,
    publish,
    error$: errorSubject.asObservable(),
    data$: dataSubject.asObservable(),
  }
}
