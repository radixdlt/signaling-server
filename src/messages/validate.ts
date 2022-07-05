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
      error,
    })
  }
}

export const validateMessage = (
  message: MessageTypesObjects
): Result<MessageTypesObjects, MessageError> =>
  ({
    subscribe: () => validate(SubscribeIO, message),
    offer: () => validate(OfferIO, message),
    answer: () => validate(AnswerIO, message),
    iceCandidate: () => validate(IceCandidateIO, message),
  }[message.method]() ||
  err({
    name: 'MissingMethodError',
    data: message,
  }))
