import { ResultAsync } from 'neverthrow'
import { bufferToString, parseJSON } from '../utils/utils'
import { handleMessageError, MessageError } from '../utils/error'
import { RawData } from 'ws'
import { validateMessage } from './validate'
import { MessageTypesObjects } from './_types'
import { getClientsByConnectionId } from '../websocket'
import { log } from '../utils/log'
import { map, Observable } from 'rxjs'
import { WebSocket } from 'ws'
import { dataFns } from '../data'
import { MessageType } from './io-types'

type OkResponse = { ok: true; data?: string }
type ErrorResponse = { ok: false; error: MessageError }
export type Response = OkResponse | ErrorResponse

type DataChannelMessage = {
  connectionId: string
  instanceId: string
  clientId: string
}

const handleGetDataError = (message: MessageTypesObjects) => handleMessageError({
  message,
  name: 'GetDataError',
  handler: message.type,
  errorMessage: `could not get data for connectionId: ${message.connectionId}`,
})

const handleSetDataError = (message: MessageTypesObjects) => handleMessageError({
  message,
  name: 'AddDataError',
  handler: message.type,
  errorMessage: `could not set data for connectionId: ${message.connectionId}`,
})

const handlePublishError = (message: MessageTypesObjects) => handleMessageError({
  message,
  name: 'PublishError',
  handler: message.type,
  errorMessage: `could not publish for connectionId: ${message.connectionId}`,
})

export const messageFns = (
  dataHandlers: ReturnType<typeof dataFns>,
  instanceId: string,
  getClients: ReturnType<typeof getClientsByConnectionId>
) => {
  const { getData, setData, publish } = dataHandlers

  const parseMessage = (text: string) =>
    parseJSON<MessageTypesObjects>(text).mapErr(
      handleMessageError({
        name: 'InvalidJsonError',
        errorMessage: `unable to parse message: ${text}`,
      })
    )

  const handleMessage = (
    send: (value: OkResponse) => void,
    message: MessageTypesObjects,
    clientId: string
  ): ResultAsync<null | string, MessageError> => {
    switch (message.type) {
      case MessageType.OFFER:
        return getData(message.connectionId)
          .mapErr(handleGetDataError(message))
          .map((data) => {
            if (data) {
              send({ ok: true, data })
            }
            return data
          })

      case MessageType.ANSWER:
        return setData(message.connectionId, message.payload.sdp)
          .map(() => {
            send({ ok: true })
          })
          .mapErr(handleSetDataError(message))
          .andThen(() =>
            publish(
              JSON.stringify({
                connectionId: message.connectionId,
                clientId,
                instanceId,
              })
            ).mapErr(handlePublishError(message))
          )

      case MessageType.ICE:
        return setData(message.connectionId, JSON.stringify(message.payload))
          .map(() => {
            send({ ok: true })
          })
          .mapErr(handleSetDataError(message))
          .andThen(() =>
            publish(
              JSON.stringify({
                connectionId: message.connectionId,
                clientId,
                instanceId,
              })
            ).mapErr(handlePublishError(message))
          )

      default:
        throw new Error(`handler missing for messageType: ${message['type']}`)
    }
  }

  const handleIncomingMessage = (
    ws: WebSocket,
    buffer: RawData
  ): ResultAsync<null | string, MessageError> => {
    const send = (response: Response) => {
      log.trace({ event: 'Send', response })
      return ws.send(JSON.stringify(response))
    }

    return bufferToString(buffer)
      .mapErr(handleMessageError({ name: 'MessageConversionError' }))
      .andThen(parseMessage)
      .andThen(validateMessage)
      .map((message) => {
        if (message.connectionId) {
          ws.connectionId = message.connectionId
        }
        return message
      })
      .asyncAndThen((message) => handleMessage(send, message, ws.id))
      .mapErr((error) => {
        send({ ok: false, error })
        return error
      })
  }

  const parseDataChannelMessage = (rawMessage: string) =>
    parseJSON<DataChannelMessage>(rawMessage).mapErr((error) => {
      log.error({
        event: 'Subscribe',
        errorName: 'InvalidJsonError',
        error,
      })
    })

  const handleDataChannel = (message$: Observable<string>) =>
    message$.pipe(
      map((rawMessage) =>
        parseDataChannelMessage(rawMessage).map((message) => {
          log.trace({ message, instanceId })

          log.trace({ event: 'Subscribe', message })

          getData(message.connectionId).andThen((data) =>
            getClients(message.connectionId).map((clients) => {
              if (data) {
                for (const client of clients) {
                  if (client.id !== message.clientId) {
                    client.send(JSON.stringify({ ok: true, data }))
                  }
                }
              }
            })
          )
        })
      )
    )

  return { handleDataChannel, handleIncomingMessage }
}
