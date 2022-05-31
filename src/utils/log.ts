import { config } from '../config'
import pino, { LoggerOptions } from 'pino'

const makeLogger = () => {
  const options: LoggerOptions = {
    level: config.logLevel,
  }

  if (config.nodeEnv === 'dev') {
    options.transport = { target: 'pino-pretty' }
  }

  return pino(options)
}

export const log = makeLogger()
