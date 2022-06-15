import { MessageError } from '../utils/error'
import { object, ZodError } from 'zod'
import { err, ok, Result } from 'neverthrow'
import { MessageTypesObjects } from './_types'
import { AnswerIO, IceCandidateIO, OfferIO, SubscribeIO } from './io-types'
import { log } from 'utils/log'

const validate = (
  schema: ReturnType<typeof object>,
  message: MessageTypesObjects
): Result<MessageTypesObjects, MessageError> => {
  try {
    schema.parse(message)
    return ok(message)
  } catch (error) {
    log.error(
      `Validation failed for message: ${JSON.stringify(message, null, 2)}`
    )
    return err({
      name: 'ValidationError',
      data: JSON.stringify(message),
    })
  }
}

export const validateMessage = (
  message: MessageTypesObjects
): Result<MessageTypesObjects, MessageError> =>
  ({
    subscribe: validate(SubscribeIO, message),
    offer: validate(OfferIO, message),
    answer: validate(AnswerIO, message),
    iceCandidate: validate(IceCandidateIO, message),
  }[message.type] ||
  err({
    name: 'MissingTypeError',
    data: JSON.stringify(message),
  }))
