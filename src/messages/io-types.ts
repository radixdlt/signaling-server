import { z, object, string, union, literal, number } from 'zod'

export enum MessageType {
  OFFER = 'offer',
  ANSWER = 'answer',
  ICE = 'iceCandidate'
}

const MessageTypeSchema = {
  offer: literal(MessageType.OFFER),
  answer: literal(MessageType.ANSWER),
  ice: literal(MessageType.ICE)
}

export const AnswerIO = object({
  requestId: string(),
  type: MessageTypeSchema.answer,
  source: union([literal('android'), literal('extension'), literal('iOS')]),
  connectionId: string(),
  payload: object({
    sdp: string(),
  }),
})

export const OfferIO = object({
  requestId: string(),
  type: MessageTypeSchema.offer,
  source: union([literal('android'), literal('extension'), literal('iOS')]),
  connectionId: string(),
})

export const IceCandidateIO = object({
  requestId: string(),
  type: MessageTypeSchema.ice,
  source: union([literal('android'), literal('extension'), literal('iOS')]),
  connectionId: string(),
  payload: object({
    candidate: string(),
    sdpMid: string(),
    sdpMLineIndex: number()
  })
})

export type Answer = z.infer<typeof AnswerIO>
export type Offer = z.infer<typeof OfferIO>
export type IceCandidate = z.infer<typeof IceCandidateIO>
