import { config } from '../config'
import uWs from 'uWebSockets.js'

const RateLimit = (limit: number, interval: number) => {
  let now = 0
  const last = Symbol() as unknown as string
  const count = Symbol() as unknown as string
  setInterval(() => ++now, interval)
  return (ws: uWs.WebSocket) => {
    if (ws[last] != now) {
      ws[last] = now
      ws[count] = 1
    } else {
      return ++ws[count] > limit
    }
  }
}

export const rateLimit = RateLimit(
  config.rateLimit.messages,
  config.rateLimit.time
)
