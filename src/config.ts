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
    host: string
    password: string
    port: number
    pubSubDataChannel: string
  }
  logLevel: string
  port: number
  nodeEnv: string
  instanceId: string
  ws: { heartbeatInterval: number }
  healthCheckPort: number
}

export const config: Config = {
  redis: {
    host: getEnv('REDIS_HOST'),
    password: getEnv('REDIS_PASSWORD'),
    port: parseInt(getEnv('REDIS_PORT')),
    pubSubDataChannel: 'data',
  },
  logLevel: getEnv('LOG_LEVEL'),
  port: parseInt(getEnv('PORT')),
  nodeEnv: getEnv('NODE_ENV'),
  instanceId: v4(),
  ws: {
    heartbeatInterval: 30 * 1000,
  },
  healthCheckPort: parseInt(getEnv('HEALTH_CHECK_PORT')),
}
