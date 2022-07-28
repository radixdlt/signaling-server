import { log } from './log'
import { MessageTypes, MessageTypesObjects } from '../messages'

export type ErrorName =
  | 'RedisError'
  | 'MessageConversionError'
  | 'MessageParsingError'
  | 'InvalidJsonError'
  | 'AddDataError'
  | 'MissingTypeError'
  | 'InvalidMethodError'
  | 'ValidationError'
  | 'MissingDataError'
  | 'GetDataError'
  | 'PublishError'
  | 'MissingMethodError'
  | 'InternalError'
  | 'DataChannelError'

export type MessageError = {
  name: ErrorName
  errorMessage?: string
  error: Error
}

export const handleMessageError =
  ({
    message,
    name,
    errorMessage,
  }: {
    name: ErrorName
    errorMessage?: string
    message?: MessageTypesObjects
  }) =>
  (jsError: Error): MessageError => {
    log.error({
      errorName: name,
      errorMessage,
      message,
      jsError: {
        name: jsError.name,
        message: jsError.message,
        stack: jsError.stack,
      },
    })
    return { name, errorMessage, error: jsError }
  }
