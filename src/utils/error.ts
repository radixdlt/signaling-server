import { log } from './log'
import { MessageTypes, MessageTypesObjects } from '../messages'

export type ErrorName =
  | 'RedisError'
  | 'MessageConversionError'
  | 'MessageParsingError'
  | 'InvalidJsonError'
  | 'MissingTypeError'
  | 'InvalidMethodError'
  | 'ValidationError'
  | 'MissingDataError'
  | 'PublishError'
//   | 'SubmitAnswerError'
//   | 'SubmitOfferError'
//   | 'SubmitIceCandidateError'
| 'SubmitError'
  | 'SubscribeError'

export type MessageError = { name: ErrorName; errorMessage?: string }

// We want this method to return the incoming message INTACT (as is), but ornament "inject" an "error" prop into it, can be an object with an error type and a message
export const handleMessageError =
  ({
    message,
    name,
    errorMessage,
    handler,
  }: {
    name: ErrorName
    errorMessage?: string
    message?: MessageTypesObjects
    handler?: MessageTypes
  }) =>
  (jsError: Error): MessageError => {
    log.error({
      errorName: name,
      errorMessage,
      message,
      handler,
      jsError: {
        name: jsError.name,
        message: jsError.message,
        stack: jsError.stack,
      },
    })
    return { name, errorMessage }
  }
