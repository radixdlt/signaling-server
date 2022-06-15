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

type DataChannelMessage = {
  connectionId: string
  instanceId: string
  clientId: string
}

const handleGetDataError = (message: MessageTypesObjects) =>
  handleMessageError({
    message,
    name: 'GetDataError',
    handler: message.type,
    errorMessage: `could not get data for connectionId: ${message.connectionId}`,
  })

const handleSetDataError = (message: MessageTypesObjects) =>
  handleMessageError({
    message,
    name: 'AddDataError',
    handler: message.type,
    errorMessage: `could not set data for connectionId: ${message.connectionId}`,
  })

const handlePublishError = (message: MessageTypesObjects) =>
  handleMessageError({
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
    send: (value?: string) => void,
    message: MessageTypesObjects,
    clientId: string
  ): ResultAsync<undefined | string, MessageError> => {
    switch (message.type) {
      case 'subscribe':
        return getData(message.connectionId)
          .mapErr(handleGetDataError(message))
          .map((data) => {
            if (data) {
              send(data)
            }
            return data
          })

      case 'offer':
        return setData(message.connectionId, message.payload.sdp)
          .map((data) => {
            send(data)
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

      case 'answer':
        return setData(message.connectionId, message.payload.sdp)
          .map((data) => {
            send(data)
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

      case 'iceCandidate':
        return setData(message.connectionId, JSON.stringify(message.payload))
          .map((data) => {
            send(data)
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
  ): ResultAsync<undefined | string, MessageError> => {
    const send = (response?: string) => {
      log.trace({ event: 'Send', response })
      return ws.send(response)
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
        send(JSON.stringify({ error: error.errorMessage }))
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
                    client.send(data)
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
