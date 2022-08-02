import { ZodError } from 'zod'
import { Message } from './io-types'

export type Confirmation = {
  info: 'Confirmation'
  requestId: Message['requestId']
}

export type RemoteData = {
  info: 'RemoteData'
  requestId: Message['requestId']
  data: Message
}

export type RemoteClientDisconnected = {
  info: 'RemoteClientDisconnected'
  target: Message['source']
}

export type MissingRemoteClientError = {
  info: 'MissingRemoteClientError'
  requestId: Message['requestId']
}

export type InvalidMessageError = {
  info: 'InvalidMessageError'
  error: string
  data: string
}

export type ValidationError = {
  info: 'ValidationError'
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
