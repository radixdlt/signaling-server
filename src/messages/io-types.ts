import { z, object, string, union, literal, number } from 'zod'

const Subscribe = literal('subscribe')
const SubmitOffer = literal('submitOffer')
const SubmitAnswer = literal('submitAnswer')
const SubmitIce = literal('submitIceCandidate')

const Sources = union([literal('android'), literal('extension'), literal('iOS')])
const Types = union([Subscribe, SubmitOffer, SubmitAnswer, SubmitIce])

export const SubscribeIO = object({
  requestId: string(),
  type: Subscribe,
  source: Sources,
  connectionId: string(),
})

export const SubmitAnswerIO = object({
  requestId: string(),
  type: SubmitAnswer,
  source: Sources,
  connectionId: string(),
  payload: object({
    sdp: string(),
  }),
})

export const SubmitOfferIO = object({
  requestId: string(),
  type: SubmitOffer,
  source: Sources,
  connectionId: string(),
  payload: object({
    sdp: string(),
  }),
})

export const SubmitIceCandidateIO = object({
  requestId: string(),
  type: SubmitIce,
  source: Sources,
  connectionId: string(),
  payload: object({
    candidate: string(),
    sdpMid: string(),
    sdpMLineIndex: number(),
  }),
})

export type Subscribe = z.infer<typeof SubscribeIO>
export type SubmitAnswer = z.infer<typeof SubmitAnswerIO>
export type SubmitOffer = z.infer<typeof SubmitOfferIO>
export type SubmitIceCandidate = z.infer<typeof SubmitIceCandidateIO>
export type MessageTypes = z.infer<typeof Types>
