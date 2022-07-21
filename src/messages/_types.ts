import { Answer, IceCandidate, Offer, Subscribe } from './io-types'
export { MessageTypes } from './io-types'

export type MessageTypesObjects = Answer | Offer | IceCandidate | Subscribe

export type DataChannelMessage = {
  instanceId: string
  clientId: string
  data: MessageTypesObjects
}
