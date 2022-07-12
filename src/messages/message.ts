import { okAsync, Result, ResultAsync } from 'neverthrow'
import { bufferToString, parseJSON } from '../utils/utils'
import { handleMessageError, MessageError } from '../utils/error'
import { RawData } from 'ws'
import { validateMessage } from './validate'
import { MessageTypesObjects } from './_types'
import { log } from '../utils/log'
import { map, Observable } from 'rxjs'
import { WebSocket } from 'ws'
import { config } from '../config'
import { outgoingMessageCounter } from '../metrics/metrics'

type ValidResponse = { valid: MessageTypesObjects }
type ErrorResponse = { ok: false; error: MessageError }
export type Response = ValidResponse | MessageTypesObjects | ErrorResponse

type DataChannelMessage = {
  instanceId: string
  clientId: string
  data: MessageTypesObjects
}

export const messageFns = (
  publish: (dataChannel: string, message: string) => ResultAsync<void, Error>,
  getWebsocketClients: (connectionId: string) => Result<WebSocket[], Error>
) => {
  const handlePublishError = (message: MessageTypesObjects) =>
    handleMessageError({
      message,
      name: 'PublishError',
      handler: message.method,
      errorMessage: `could not publish for connectionId: ${message.connectionId}`,
    })

  const parseMessage = (text: string) =>
    parseJSON<MessageTypesObjects>(text).mapErr(
      handleMessageError({
        name: 'InvalidJsonError',
        errorMessage: `unable to parse message: ${text}`,
      })
    )

  const publishMessage = (
    message: MessageTypesObjects,
    clientId: string
  ): ResultAsync<MessageTypesObjects, MessageError> => {
    if (['offer', 'answer', 'iceCandidate'].includes(message.method)) {
      const data = { clientId, instanceId: config.instanceId, data: message }
      return publish(config.redis.pubSubDataChannel, JSON.stringify(data))
        .map(() => message)
        .mapErr(handlePublishError(message))
    }
    return okAsync(message)
  }

  const handleIncomingMessage = (ws: WebSocket, buffer: RawData) => {
    const sendMessage = (response: Response | MessageError) => {
      log.trace({ event: 'Send', response })
      outgoingMessageCounter.inc()
      return ws.send(JSON.stringify(response))
    }

    return (
      bufferToString(buffer)
        .mapErr(handleMessageError({ name: 'MessageConversionError' }))
        .andThen(parseMessage)
        // .andThen(validateMessage)
        .map((message) => {
          if (message.connectionId) {
            ws.connectionId = message.connectionId
          }
          return message
        })
        .asyncAndThen((message) => publishMessage(message, ws.id))
        .map((message) => {
          sendMessage({ valid: message })
        })
        .mapErr((error) => {
          sendMessage(error)
        })
    )
  }

  const handleDataChannel = (message$: Observable<string>) =>
    message$.pipe(
      map((rawMessage) =>
        parseJSON<DataChannelMessage>(rawMessage).andThen((message) =>
          getWebsocketClients(message.data.connectionId).map((clients) => {
            for (const client of clients) {
              if (client.id !== message.clientId) {
                log.trace({ event: 'Send', message: message.data })
                client.send(JSON.stringify(message.data))
                outgoingMessageCounter.inc()
              }
            }
          })
        )
      )
    )

  return { handleDataChannel, handleIncomingMessage }
}
