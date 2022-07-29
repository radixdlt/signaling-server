import { MessageError } from '../utils/error'
import { object } from 'zod'
import { err, errAsync, ok, okAsync, Result, ResultAsync } from 'neverthrow'
import { MessageTypesObjects } from './_types'
import { AnswerIO, IceCandidateIO, OfferIO, SubscribeIO } from './io-types'
import { log } from '../utils/log'

const validate = (
  schema: ReturnType<typeof object>,
  message: MessageTypesObjects
): ResultAsync<MessageTypesObjects, MessageError> => {
  return ResultAsync.fromPromise(
    schema.parseAsync(message),
    (error) => error as Error
  )
    .map(() => message)
    .mapErr((error) => ({
      name: 'ValidationError',
      error: error as Error,
    }))
}

export const validateMessage = (
  message: MessageTypesObjects
): ResultAsync<MessageTypesObjects, MessageError> => {
  switch (message.method) {
    case 'subscribe':
      return validate(SubscribeIO, message)
    case 'offer':
      return validate(OfferIO, message)
    case 'answer':
      return validate(AnswerIO, message)
    case 'iceCandidate':
      return validate(IceCandidateIO, message)

    default:
      return errAsync({
        name: 'MissingMethodError',
        errorMessage: 'invalid method',
        error: Error('invalid method'),
      })
  }
}
