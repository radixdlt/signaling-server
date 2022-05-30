import { MessageError, ErrorName } from '../error'
import { object, ValidationError as YupValidationError } from 'yup'
import { err, ok, Result } from 'neverthrow'
import { MessageTypesObjects } from './_types'
import { GetDataIO, SetDataIO } from './io-types'

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
): Result<MessageTypesObjects, MessageError> => {
  switch (message.type) {
    case 'GetData':
      return validate(GetDataIO, message)

    case 'SetData':
      return validate(SetDataIO, message)

    default:
      return err({
        name: 'MissingTypeError',
        errors: [`invalid messageType: ${message['type']}`],
      })
  }
}
