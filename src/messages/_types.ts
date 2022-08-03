import { ZodError } from 'zod'
import { Message } from './io-types'

export type Confirmation = {
  info: 'confirmation'
  requestId: Message['requestId']
}

export type RemoteData = {
  info: 'remoteData'
  requestId: Message['requestId']
  data: Message
}

export type RemoteClientDisconnected = {
  info: 'remoteClientDisconnected'
  target: Message['source']
}

export type MissingRemoteClientError = {
  info: 'missingRemoteClientError'
  requestId: Message['requestId']
}

export type InvalidMessageError = {
  info: 'invalidMessageError'
  error: string
  data: string
}

export type ValidationError = {
  info: 'validationError'
  requestId: Message['requestId']
  error: ZodError[]
}

export type MessageTypes =
  | Confirmation
  | RemoteData
  | RemoteClientDisconnected
  | MissingRemoteClientError
  | InvalidMessageError
  | ValidationError
