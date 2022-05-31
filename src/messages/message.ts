import { ResultAsync } from 'neverthrow'
import { bufferToString, parseJSON } from '../utils/utils'
import { handleMessageError, MessageError } from '../utils/error'
import { RawData, WebSocketServer } from 'ws'
import { validateMessage } from './validate'
import { MessageTypesObjects } from './_types'
import { getClientsByConnectionId } from '../websocket'
import { log } from '../utils/log'
import { map, Observable } from 'rxjs'
import { WebSocket } from 'ws'
import { dataFns } from '../data'

type OkResponse = { ok: true; data?: string }
type ErrorResponse = { ok: false; error: MessageError }
export type Response = OkResponse | ErrorResponse

type DataChannelMessage = {
  connectionId: string
  instanceId: string
  clientId: string
}

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
    message: MessageTypesObjects
  ): ResultAsync<null | string, MessageError> => {
    switch (message.type) {
      case 'GetData':
        return getData(message.payload.connectionId)
          .mapErr(
            handleMessageError({
              message,
              name: 'GetDataError',
              handler: 'GetData',
            })
          )
          .map((data) => {
            if (data) {
              send({ ok: true, data })
            }
            return data
          })

      case 'SetData':
        return setData(message.payload.connectionId, message.payload.data)
          .map(() => {
            send({ ok: true })
          })
          .mapErr(
            handleMessageError({
              message,
              name: 'AddDataError',
              handler: 'SetData',
              errorMessage: `could not add data for connectionId: ${message.payload.connectionId}`,
            })
          )
          .andThen(() =>
            publish(message.payload.connectionId).mapErr(
              handleMessageError({
                message,
                name: 'PublishError',
                handler: 'SetData',
                errorMessage: `could not publish for connectionId: ${message.payload.connectionId}`,
              })
            )
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
        if (message.payload.connectionId) {
          ws.connectionId = message.payload.connectionId
        }
        return message
      })
      .asyncAndThen((message) => handleMessage(send, message))
      .mapErr((error) => {
        ws.send({ ok: false, error })
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
