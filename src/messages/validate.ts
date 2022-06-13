import { MessageError } from '../utils/error'
import { object, ZodError } from 'zod'
import { err, ok, Result } from 'neverthrow'
import { MessageTypesObjects } from './_types'
import { AnswerIO, IceCandidateIO, OfferIO } from './io-types'

const validate = (
  schema: ReturnType<typeof object>,
  message: MessageTypesObjects
): Result<MessageTypesObjects, MessageError> => {
  try {
    schema.parse(message)
    return ok(message)
  } catch (error) {
    const { errors } = error as ZodError
    return err({
      name: 'ValidationError',
      errorMessage: errors.join(', '),
    })
  }
}

export const validateMessage = (
  message: MessageTypesObjects
): Result<MessageTypesObjects, MessageError> =>
({
  offer: validate(OfferIO, message),
  answer: validate(AnswerIO, message),
  iceCandidate: validate(IceCandidateIO, message)
}[message.type] ||
  err({
    name: 'MissingTypeError',
    errorMessage: `invalid message type: ${message['type']}`,
  }))
