import { GetData, SetData } from './io-types'

export type MessageTypes = 'GetData' | 'SetData'

type Message<M extends MessageTypes, P = void> = { type: M; payload: P }

type GetDataObject = Message<'GetData', GetData>

type AddDataObject = Message<'SetData', SetData>

export type MessageTypesObjects = GetDataObject | AddDataObject
