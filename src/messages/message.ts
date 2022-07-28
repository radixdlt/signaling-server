import { combine, combineWithAllErrors, okAsync, ResultAsync } from 'neverthrow'
import { parseJSON } from '../utils/utils'
import { handleMessageError, MessageError } from '../utils/error'
import { validateMessage } from './validate'
import { DataChannelMessage, MessageTypesObjects } from './_types'
import { log } from '../utils/log'
import { outgoingMessageCounter } from '../metrics/metrics'
import { DataChannelRepoType } from '../data/data-channel-repo'
import { sendAsync } from '../websocket/send-async'
import { WebSocket } from 'uWebSockets.js'

type ValidResponse = { valid: MessageTypesObjects }
export type Response =
  | ValidResponse
  | MessageTypesObjects
  | { errorMessage?: string; name: string; error?: Error }

export const messageFns = (
  dataChannelRepo: DataChannelRepoType,
  getClients: (connectionId: string) => ResultAsync<string[], Error>,
  addClient: (
    connectionId: string,
    clientId: string
  ) => ResultAsync<void, Error>,
  publish: (channel: string, message: string) => ResultAsync<void, Error>
) => {
  const handlePublishError = (message: MessageTypesObjects) =>
    handleMessageError({
      message,
      name: 'PublishError',
      errorMessage: `could not publish for connectionId: ${message.connectionId}`,
    })

  const handleDataChannelError = (message: MessageTypesObjects) =>
    handleMessageError({
      message,
      name: 'DataChannelError',
      errorMessage: `could not open data chanel`,
    })

  const handleAddClientError = (message: MessageTypesObjects) =>
    handleMessageError({
      name: 'InternalError',
      message,
    })

  const parseMessage = (text: string) => parseJSON<MessageTypesObjects>(text)

  const handleIncomingMessage = (ws: WebSocket, rawMessage: string) => {
    const sendMessage = (response: Response) => {
      ws.send(JSON.stringify(response))
      log.trace({ event: 'SendMessageToClient', response })
      outgoingMessageCounter.inc()
      // return sendAsync(ws, JSON.stringify(response)).map(() => {
      //   log.trace({ event: 'SendMessageToClient', response })
      //   outgoingMessageCounter.inc()
      // })
    }

    const handleDataChannelMessage = (rawMessage: string) => {
      parseJSON<MessageTypesObjects>(rawMessage)
        .map((message) => {
          log.trace({
            event: 'IncomingDataChanelMessage',
            message,
          })
          return message
        })
        .map(
          (message) => sendMessage(message)
          // .mapErr((error) => {
          //   log.error({ event: 'OutgoingWSMessage', error, message })
          // })
        )
    }

    return parseMessage(rawMessage)
      .mapErr(
        handleMessageError({
          name: 'InvalidJsonError',
          errorMessage: `unable to parse message: ${rawMessage}`,
        })
      )
      .andThen(validateMessage)
      .mapErr((err) => {
        sendMessage({
          errorMessage: err.errorMessage,
          name: err.name,
          error: err.error,
        })
        return
      })
      .asyncAndThen((message) => {
        log.trace({ event: 'IncomingMessage', message })
        const dataChannelId = dataChannelRepo.getId(ws)

        if (dataChannelId) return okAsync({ message, dataChannelId })

        const res = dataChannelRepo
          .add(ws, handleDataChannelMessage)
          // .mapErr(handleDataChannelError(message))
          .andThen((id) =>
            addClient(message.connectionId, id)
              // .mapErr(handleAddClientError(message))
              .map(() => ({ message, dataChannelId: id }))
          )

        return res
      })

      .andThen(({ message, dataChannelId }) =>
        getClients(message.connectionId)
          .map((ids) => ids.filter((id) => id !== dataChannelId))
          .map(
            (clientIds) =>
              combine(
                clientIds.map((id) => publish(id, JSON.stringify(message)))
              )
            // .mapErr((errors) => errors.map(handlePublishError(message)))
          )
          .map(() => sendMessage({ valid: message }))
      )
  }

  return { handleIncomingMessage }
}
