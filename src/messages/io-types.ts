import { z, object, string, union, literal } from 'zod'

const MessageTypes = union([literal('offer'), literal('answer')])

export const SetDataIO = object({
  requestId: string(),
  type: MessageTypes,
  source: union([literal('android'), literal('extension'), literal('iOS')]),
  connectionId: string(),
  payload: object({
    sdp: string(),
  }),
})

export const GetDataIO = object({
  requestId: string(),
  type: union([literal('offer'), literal('answer')]),
  source: union([literal('android'), literal('extension'), literal('iOS')]),
  connectionId: string(),
})

export type GetData = z.infer<typeof GetDataIO>
export type SetData = z.infer<typeof SetDataIO>
export type MessageTypes = z.infer<typeof MessageTypes>
