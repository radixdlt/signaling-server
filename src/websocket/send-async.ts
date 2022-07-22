import { ResultAsync } from 'neverthrow'
import { WebSocket } from 'ws'

export const sendAsync = (
  ws: WebSocket,
  message: string
): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(
    new Promise((resolve, reject) => {
      ws.send(message, (err) => {
        if (err) return reject(err)
        resolve(undefined)
      })
    }),
    (error) => error as Error
  )
