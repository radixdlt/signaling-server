import { z, object, string, union, literal, number } from 'zod'

const Offer = literal('offer')
const Answer = literal('answer')
const Ice = literal('iceCandidate')
const Subscribe = literal('subscribe')

const Types = union([Offer, Answer, Ice, Subscribe])

export const SubscribeIO = object({
  type: Subscribe,
  source: union([literal('android'), literal('extension'), literal('iOS')]),
  connectionId: string(),
  requestId: string(),
})

export const AnswerIO = object({
  requestId: string(),
  type: Answer,
  source: union([literal('android'), literal('extension'), literal('iOS')]),
  connectionId: string(),
  payload: object({
    sdp: string(),
  }),
})

export const OfferIO = object({
  requestId: string(),
  type: Offer,
  source: union([literal('android'), literal('extension'), literal('iOS')]),
  connectionId: string(),
  payload: object({
    sdp: string(),
  }),
})

export const IceCandidateIO = object({
  requestId: string(),
  type: Ice,
  source: union([literal('android'), literal('extension'), literal('iOS')]),
  connectionId: string(),
  payload: object({
    candidate: string(),
    sdpMid: string(),
    sdpMLineIndex: number(),
  }),
})

export type Answer = z.infer<typeof AnswerIO>
export type Offer = z.infer<typeof OfferIO>
export type IceCandidate = z.infer<typeof IceCandidateIO>
export type Subscribe = z.infer<typeof SubscribeIO>
export type MessageTypes = z.infer<typeof Types>
