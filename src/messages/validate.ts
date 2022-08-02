import { ZodError } from 'zod'
import { ResultAsync } from 'neverthrow'
import { Message, MessageIO } from './io-types'

export const validateMessage = (
  message: Message
): ResultAsync<Message, ZodError[]> =>
  ResultAsync.fromPromise(
    MessageIO.parseAsync(message),
    (error) => (error as any).issues as ZodError[]
  ).map(() => message)
