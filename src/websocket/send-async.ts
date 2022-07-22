import { okAsync, ResultAsync } from 'neverthrow'
import { log } from '../utils/log'
import { WebSocket } from 'ws'

export const sendAsync = (
  ws: WebSocket,
  message: string
): ResultAsync<void, Error> => {
  if (ws.readyState === ws.OPEN) {
    return ResultAsync.fromPromise(
      new Promise((resolve, reject) => {
        ws.send(message, (err) => {
          if (err) return reject(err)
          resolve(undefined)
        })
      }),
      (error) => error as Error
    )
  } else {
    log.trace({ event: 'WebSocketClosed', state: ws.readyState, message })
    return okAsync(undefined)
  }
}
