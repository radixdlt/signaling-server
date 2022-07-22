import { combineWithAllErrors, okAsync, ResultAsync } from 'neverthrow'
import { parseJSON } from '../utils/utils'
import { handleMessageError, MessageError } from '../utils/error'
import { validateMessage } from './validate'
import { DataChannelMessage, MessageTypesObjects } from './_types'
import { log } from '../utils/log'
import { WebSocket } from 'ws'
import { outgoingMessageCounter } from '../metrics/metrics'
import { DataChannelRepoType } from '../data/data-channel-repo'
import { sendAsync } from '../websocket/send-async'

type ValidResponse = { valid: MessageTypesObjects }
type ErrorResponse = { ok: false; error: MessageError }
export type Response = ValidResponse | MessageTypesObjects | ErrorResponse

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
      handler: message.method,
      errorMessage: `could not publish for connectionId: ${message.connectionId}`,
    })

  const handleDataChannelError = (message: MessageTypesObjects) =>
    handleMessageError({
      message,
      name: 'DataChannelError',
      handler: message.method,
      errorMessage: `could not open data chanel`,
    })

  const handleAddClientError = (message: MessageTypesObjects) =>
    handleMessageError({
      name: 'InternalError',
      message,
    })

  const parseMessage = (text: string) =>
    parseJSON<MessageTypesObjects>(text).mapErr(
      handleMessageError({
        name: 'InvalidJsonError',
        errorMessage: `unable to parse message: ${text}`,
      })
    )

  const handleIncomingMessage = (ws: WebSocket, rawMessage: string) => {
    const sendMessage = (response: Response | MessageError) =>
      sendAsync(ws, JSON.stringify(response)).map(() => {
        log.trace({ event: 'SendMessageToClient', response })
        outgoingMessageCounter.inc()
      })

    const handleDataChannelMessage = (incomingMessage: string) => {
      parseJSON<DataChannelMessage['data']>(incomingMessage)
        .asyncAndThen((parsed) =>
          sendMessage(parsed).map(() => {
            log.trace({
              event: 'IncomingDataChanelMessage',
              message: parsed,
            })
          })
        )
        .mapErr((err) => {
          log.error(err)
        })
    }

    return parseMessage(rawMessage)
      .andThen(validateMessage)
      .asyncAndThen((message) => {
        log.trace({ event: 'IncomingMessage', message, clientId: ws.id })
        const dataChannelId = dataChannelRepo.getId(ws)

        if (dataChannelId) return okAsync({ message, dataChannelId })

        return dataChannelRepo
          .add(ws, handleDataChannelMessage)
          .mapErr(handleDataChannelError(message))
          .andThen((id) =>
            addClient(message.connectionId, id)
              .mapErr(handleAddClientError(message))
              .map(() => id)
          )
          .map((id) => {
            return { message, dataChannelId: id }
          })
      })

      .andThen(({ message, dataChannelId }) =>
        getClients(message.connectionId)
          .map((ids) => ids.filter((id) => id !== dataChannelId))
          .map((clientIds) =>
            combineWithAllErrors(
              clientIds.map((id) => publish(id, JSON.stringify(message)))
            ).mapErr((errors) => errors.map(handlePublishError(message)))
          )
          .andThen(() => sendMessage({ valid: message }))
          .mapErr(handlePublishError(message))
      )
      .mapErr(sendMessage)
  }

  return { handleIncomingMessage }
}
