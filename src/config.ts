import { v4 } from 'uuid'

const getEnv = (key: string) => {
  const env = process.env[key]
  if (env) {
    return env
  }
  throw `missing env: ${key}`
}

export const config = {
  redis: {
    host: getEnv('REDIS_HOST'),
    password: getEnv('REDIS_PASSWORD'),
    port: getEnv('REDIS_PORT'),
    pubSubDataChannel: 'data',
  },
  logLevel: getEnv('LOG_LEVEL'),
  port: parseInt(getEnv('PORT')),
  nodeEnv: getEnv('NODE_ENV'),
  instanceId: v4(),
  ws: {
    heartbeatInterval: 30 * 1000,
  },
}
