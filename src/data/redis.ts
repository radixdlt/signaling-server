import { log } from '../utils/log'
import { createClient } from '@redis/client'
import { config } from '../config'
import { ResultAsync } from 'neverthrow'
import { publishMessageCounter } from '../metrics/metrics'

type RedisClientConfig = Parameters<typeof createClient>[0]

export type CreateDataChannel = Awaited<
  ReturnType<typeof redisClient>
>['createDataChannel']

export const redisClient = async () => {
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

  subscriber.on('error', (err) => {
    log.error(err)
  })

  publisher.on('error', (err) => {
    log.error(err)
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
    ).map(() => {
      log.trace({ event: 'PublishMessage', message, channel })
      publishMessageCounter.inc()
    })

  const connectClient = (
    name: string,
    redisClient: ReturnType<typeof createClient>
  ) =>
    ResultAsync.fromPromise(redisClient.connect(), (e) => e as Error).map(
      () => {
        log.info({ event: 'OpenRedisConnection', clientName: name })
      }
    )

  const subscribeToDataChannel = (
    dataChannel: string,
    onMessage: (message: string) => void
  ) =>
    ResultAsync.fromPromise(
      subscriber.subscribe(dataChannel, onMessage),
      (error) => error as Error
    )

  const createDataChannel = (
    dataChannel: string,
    onMessage: (message: string) => void
  ) => {
    log.trace({ event: 'DataChanelSubscribe', dataChannel })
    return subscribeToDataChannel(dataChannel, onMessage).map(() => ({
      unsubscribe: () => {
        log.trace({ event: 'DataChanelUnsubscribe', dataChannel })
        return ResultAsync.fromPromise(
          subscriber.unsubscribe(dataChannel),
          (error) => error as Error
        )
      },
    }))
  }

  const connect = async () =>
    ResultAsync.combine([
      connectClient('publisher', publisher),
      connectClient('subscriber', subscriber),
    ])

  const connection = await connect()

  // A redis connection error at this point is most likely caused by a misconfiguration
  if (connection.isErr()) {
    console.error(connection.error)
    log.error(connection.error)
    throw connection.error
  }

  const addClient = async (connectionId: string, clientId: string) => {
    log.trace({ event: 'AddClient', connectionId, clientId })
    await publisher.sAdd(connectionId, clientId)
    await publisher.expireAt(connectionId, Date.now() + 3600 * 1000)
  }

  const getClients = async (connectionId: string) => {
    const clients = await publisher.sMembers(connectionId)
    log.trace({ event: 'getClients', connectionId, clients })
    return clients
  }

  return {
    addClient: (connectionId: string, clientId: string) =>
      ResultAsync.fromPromise<void, Error>(
        addClient(connectionId, clientId),
        (error) => error as Error
      ),
    getClients: (connectionId: string) =>
      ResultAsync.fromPromise<string[], Error>(
        getClients(connectionId),
        (error) => error as Error
      ),
    createDataChannel,
    publish,
    publisher,
    subscriber,
  }
}
