import { MessageError } from '../utils/error'
import { object, ValidationError as YupValidationError } from 'yup'
import { err, ok, Result } from 'neverthrow'
import { MessageTypesObjects } from './_types'
import { GetDataIO } from './io-types'

const validate = (
  schema: ReturnType<typeof object>,
  message: MessageTypesObjects
): Result<MessageTypesObjects, MessageError> => {
  try {
    schema.validateSync(message.payload)
    return ok(message)
  } catch (error) {
    const { errors } = error as YupValidationError
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
    GetData: validate(GetDataIO, message),
    SetData: validate(GetDataIO, message),
  }[message.type] ||
  err({
    name: 'MissingTypeError',
    errorMessage: `invalid message type: ${message['type']}`,
  }))
