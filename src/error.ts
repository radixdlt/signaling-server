import { log } from './log';
import { MessageTypes, MessageTypesObjects } from './messages';

export enum ErrorName {
  RedisError = 'RedisError',
  MessageConversionError = 'MessageConversionError',
  InvalidJsonError = 'InvalidJsonError',
  AddDataError = 'AddDataError',
  MissingTypeError = 'MissingTypeError',
  InvalidMethodError = 'InvalidMethodError',
  ValidationError = 'ValidationError',
  MissingDataError = 'MissingDataError',
  GetDataError = 'GetDataError',
  PublishError = 'PublishError',
}

export type MessageError = { name: ErrorName; errorMessage?: string };

export const handleMessageError =
  ({
    message,
    name,
    errorMessage,
    handler,
  }: {
    name: ErrorName;
    errorMessage?: string;
    message?: MessageTypesObjects,
    handler?: MessageTypes,
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
    });
    return { name, errorMessage };
  };
