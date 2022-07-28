import { MessageError } from '../utils/error'
import { object } from 'zod'
import { err, ok, Result } from 'neverthrow'
import { MessageTypesObjects } from './_types'
import { AnswerIO, IceCandidateIO, OfferIO, SubscribeIO } from './io-types'
import { log } from '../utils/log'

const validate = (
  schema: ReturnType<typeof object>,
  message: MessageTypesObjects
): Result<MessageTypesObjects, MessageError> => {
  try {
    schema.parse(message)
    return ok(message)
  } catch (error) {
    log.error({ event: 'ValidationError', error })
    return err({
      name: 'ValidationError',
      error: error as Error,
    })
  }
}

export const validateMessage = (
  message: MessageTypesObjects
): Result<MessageTypesObjects, MessageError> => {
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
      return err({
        name: 'MissingMethodError',
        errorMessage: 'invalid method',
        error: Error('invalid method'),
      })
  }
}
