import { log } from '../utils/log'
import { createClient } from '@redis/client'
import { config } from '../config'
import { Subject } from 'rxjs'
import { combine, ResultAsync } from 'neverthrow'

export const redisClient = () => {
  const client = createClient({
    url: `redis://${config.redis.host}:${config.redis.port}`,
    password: config.redis.password,
  })
  const subscriber = client.duplicate()
  const publisher = client.duplicate()

  const errorSubject = new Subject<any>()
  const dataSubject = new Subject<string>()

  client.on('error', (err) => {
    errorSubject.next(err)
  })

  const publish = (channel: string) => (message: string) =>
    ResultAsync.fromPromise(
      publisher.publish(channel, message),
      (e) => e as Error
    ).map(() => undefined)

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
      connectClient('client', client),
      connectClient('publisher', publisher),
      connectClient('subscriber', subscriber),
    ]).map(() => {
      subscriber.subscribe(config.redis.pubSubDataChannel, (connectionId) => {
        dataSubject.next(connectionId)
      })
    })

  const setData = (key: string, value: string) => {
    log.info(`setting data with key ${key} and value ${value}`)
    return ResultAsync.fromPromise(
      client.set(key, value).then((res) => res || undefined),
      (e) => e as Error
    )
  }

  const getData = (key: string) => {
    log.info(`getting data with key ${key}`)
    return ResultAsync.fromPromise(
      client.get(key).then((res) => res || undefined),
      (e) => e as Error
    )
  }

  return {
    isConnected: client.isOpen,
    connect,
    setData,
    getData,
    publish,
    error$: errorSubject.asObservable(),
    data$: dataSubject.asObservable(),
  }
}
