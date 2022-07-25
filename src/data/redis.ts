import { log } from '../utils/log'
import { createClient } from '@redis/client'
import { config } from '../config'
import { Subject } from 'rxjs'
import { combine, ResultAsync } from 'neverthrow'

type RedisClientConfig = Parameters<typeof createClient>[0]

export const redisClient = () => {
  const subscriberConfig: RedisClientConfig = {
    url: `redis://${config.redis.sub_host}:${config.redis.port}`,
  }
  const publisherConfig: RedisClientConfig = {
    url: `redis://${config.redis.pub_host}:${config.redis.port}`,
  }

  if (config.redis.password) {
    subscriberConfig.password = config.redis.password
    publisherConfig.password = config.redis.password
  }

  const subscriber = createClient(subscriberConfig)
  const publisher = createClient(publisherConfig)

  const errorSubject = new Subject<any>()
  const dataSubject = new Subject<string>()

  subscriber.on('error', (err) => {
    console.error(err)
    errorSubject.next(err)
  })

  publisher.on('error', (err) => {
    console.error(err)
    errorSubject.next(err)
  })

  subscriber.on('connect', () => {
    log.info('RedisSubClient connect')
  })
  subscriber.on('ready', () => {
    log.info('RedisSubClient ready')
  })
  subscriber.on('end', () => {
    log.info('RedisSubClient end')
  })
  subscriber.on('reconnecting', () => {
    log.info('RedisSubClient reconnecting')
  })

  publisher.on('connect', () => {
    log.info('RedisPubClient connect')
  })
  publisher.on('ready', () => {
    log.info('RedisPubClient ready')
  })
  publisher.on('end', () => {
    log.info('RedisPubClient end')
  })
  publisher.on('reconnecting', () => {
    log.info('RedisPubClient reconnecting')
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
        log.info({ event: 'OpenRedisConnection', clientName: name })
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
