import { randomUUID } from 'node:crypto'

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
  rateLimit: {
    messages: number
    time: number
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
  instanceId: randomUUID(),
  ws: {
    heartbeatInterval: 30 * 1000,
  },
  rateLimit: {
    messages: parseInt(process.env.RATE_LIMIT_MESSAGES || '100'),
    time: parseInt(process.env.RATE_LIMIT_MS || '1000'),
  },
}
