import { z, object, string, union, literal, number } from 'zod'

const Offer = literal('offer')
const Answer = literal('answer')
const Ice = literal('iceCandidate')

const Methods = union([Offer, Answer, Ice])

export const MessageIO = object({
  requestId: string(),
  method: union([Answer, Offer, Ice]),
  source: union([literal('wallet'), literal('extension')]),
  connectionId: string(),
  encryptedPayload: string(),
  startAt: number().optional(),
})

export type MessageMethods = z.infer<typeof Methods>
export type Message = z.infer<typeof MessageIO>
