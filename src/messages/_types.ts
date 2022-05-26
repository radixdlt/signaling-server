import { MessageError } from '../error'
import { ResultAsync } from 'neverthrow'
import { WebSocket } from 'ws'
import { GetData, SetData } from './io-types'

export type MessageTypes = 'GetData' | 'SetData'

export type Message<M extends MessageTypes, P = void> = { type: M; payload: P }

export type GetDataObject = Message<'GetData', GetData>

export type AddDataObject = Message<'SetData', SetData>

export type MessageTypesObjects = GetDataObject | AddDataObject

export type OkResponse = { ok: true; data?: string }
export type ErrorResponse = { ok: false; error: MessageError }
export type Response = OkResponse | ErrorResponse

export type Dependencies = {
  getData: (
    connectionId: GetData['connectionId']
  ) => ResultAsync<string | null, Error>
  setData: (
    connectionId: SetData['connectionId'],
    data: SetData['data']
  ) => ResultAsync<null, Error>
  publish: (connectionId: string) => ResultAsync<null, Error>
  send: (response: Response) => void
  ws: WebSocket
}
