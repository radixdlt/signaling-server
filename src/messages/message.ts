import { combineWithAllErrors, ResultAsync } from 'neverthrow'
import { parseJSON } from '../utils/utils'
import { handleMessageError, MessageError } from '../utils/error'
import { validateMessage } from './validate'
import { DataChannelMessage, MessageTypesObjects } from './_types'
import { log } from '../utils/log'
import { WebSocket } from 'ws'
import { outgoingMessageCounter } from '../metrics/metrics'
import { CreateDataChannel } from '../data/redis'
import { config } from '../config'

type ValidResponse = { valid: MessageTypesObjects }
type ErrorResponse = { ok: false; error: MessageError }
export type Response = ValidResponse | MessageTypesObjects | ErrorResponse

export const messageFns = (
  createDataChannel: CreateDataChannel,
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

  const parseMessage = (text: string) =>
    parseJSON<MessageTypesObjects>(text).mapErr(
      handleMessageError({
        name: 'InvalidJsonError',
        errorMessage: `unable to parse message: ${text}`,
      })
    )

  const handleIncomingMessage = (ws: WebSocket, rawMessage: string) => {
    const sendMessage = (response: Response | MessageError) => {
      // log.trace({ event: 'Send', response })
      outgoingMessageCounter.inc()
      return ws.send(JSON.stringify(response), (error) => {
        if (error) log.error(error)
      })
    }

    const handleDataChannelMessage = (incomingMessage: string) => {
      parseJSON<DataChannelMessage>(incomingMessage)
        .map((parsed) => {
          if (parsed.clientId !== ws.id) {
            log.trace({
              event: 'IncomingDataChanelMessage',
              message: parsed.data,
            })

            sendMessage(parsed.data)
          }
        })
        .mapErr((err) => {
          log.error(err)
        })
    }

    return parseMessage(rawMessage)
      .andThen(validateMessage)
      .map((message) => {
        log.trace({ event: 'IncomingMessage', message, clientId: ws.id })
        ws.connectionId = message.connectionId

        // clientRepo.add(ws.connectionId, ws.id, ws)

        if (!ws.dataChanel) {
          addClient(message.connectionId, ws.id)
            .map(() => {
              ws.dataChanel = createDataChannel(ws.id, handleDataChannelMessage)

              ws.removeDataChanel = () => {
                if (ws.dataChanel) {
                  ws.dataChanel.unsubscribe()
                  ws.dataChanel = undefined
                  ws.removeDataChanel = undefined
                }
              }
            })
            .mapErr((error) => {
              log.error(error)
            })
        }

        return message
      })
      .asyncAndThen((message) => {
        return getClients(ws.connectionId)
          .map((ids) => ids.filter((id) => id !== ws.id))
          .map((clientIds) => {
            const outgoingMessage: DataChannelMessage = {
              instanceId: config.instanceId,
              clientId: ws.id,
              data: message,
            }
            return combineWithAllErrors(
              clientIds.map((id) =>
                publish(id, JSON.stringify(outgoingMessage))
              )
            ).mapErr((errors) => errors.map(handlePublishError(message)))
          })
          .map(() => {
            sendMessage({ valid: message })
          })
          .mapErr(handlePublishError(message))
      })
      .mapErr((error) => {
        sendMessage(error)
      })
  }

  return { handleIncomingMessage }
}
