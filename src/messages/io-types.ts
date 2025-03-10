import { z, object, string, union, literal, number } from 'zod'

const Offer = literal('offer')
const Answer = literal('answer')
const Ice = literal('iceCandidate')
const IceCandidates = literal('iceCandidates')

const Methods = union([Offer, Answer, Ice, IceCandidates])

export const MessageIO = object({
  requestId: string(),
  method: Methods,
  source: union([literal('wallet'), literal('extension')]).optional(), // redundant field, to be removed
  connectionId: string().optional(), // redundant field, to be removed
  encryptedPayload: string(),
  targetClientId: string(),
  startAt: number().optional(),
})

export type MessageMethods = z.infer<typeof Methods>
export type Message = z.infer<typeof MessageIO>
