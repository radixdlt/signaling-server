import { MessageError, ErrorName } from '../error';
import { object, string, ValidationError as YupValidationError } from 'yup';
import { err, ok, Result } from 'neverthrow';
import { MessageType, MessageTypes } from './_types';

const validate =
  (schema: ReturnType<typeof object>) =>
  (message: MessageTypes): Result<MessageTypes, MessageError> => {
    try {
      schema.validateSync(message.payload);
      return ok(message);
    } catch (error) {
      const { errors } = error as YupValidationError;
      return err({
        name: ErrorName.ValidationError,
        errorMessage: errors.join(', '),
      });
    }
  };

export const validateMessage = (
  message: MessageTypes
): Result<MessageTypes, MessageError> => {
  switch (message.type) {
    case MessageType.GetData:
      return validate(
        object({
          connectionId: string().required(),
        })
      )(message);

    case MessageType.SetData:
      return validate(
        object({
          connectionId: string().required(),
          data: string().required(),
        })
      )(message);

    default:
      return err({
        name: ErrorName.MissingTypeError,
        errors: [`invalid messageType: ${message['type']}`],
      });
  }
};
