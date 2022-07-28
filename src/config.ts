import { v4 } from 'uuid'

const getEnv = (key: string) => {
  const env = process.env[key]
  if (env) {
    return env
  }
  throw `missing env: ${key}`
}

type Config = {
  redis: {
    pub_host: string
    sub_host: string
    password: string | undefined
    port: number
    pubSubDataChannel: string
  }
  logLevel: string
  port: number
  httpPort: number
  nodeEnv: string
  instanceId: string
  ws: { heartbeatInterval: number }
  queue: {
    concurrency: number
    expirationTime: number
    intervalTime: number
  }
}

export const config: Config = {
  redis: {
    pub_host: getEnv('REDIS_HOST_PUB'),
    sub_host: getEnv('REDIS_HOST_SUBS'),
    password: process.env.REDIS_PASSWORD,
    port: parseInt(getEnv('REDIS_PORT')),
    pubSubDataChannel: 'data',
  },
  logLevel: getEnv('LOG_LEVEL'),
  port: parseInt(getEnv('PORT')),
  httpPort: parseInt(getEnv('HTTP_PORT')),
  nodeEnv: getEnv('NODE_ENV'),
  instanceId: v4(),
  ws: {
    heartbeatInterval: 30 * 1000,
  },
  queue: {
    concurrency: parseInt(process.env.CONCURRENCY || '100'),
    expirationTime: parseInt(
      process.env.EXPIRATION_TIME_MS || `${3600 * 1000}`
    ),
    intervalTime: 60 * 1000,
  },
}
