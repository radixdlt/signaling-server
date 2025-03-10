import { config } from '../config'
import { Logger } from 'tslog'

export const log = new Logger({ minLevel: parseInt(config.logLevel) || 0 })
