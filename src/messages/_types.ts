import { GetData, SetData } from './io-types'

export type MessageTypes = 'getData' | 'setData'

type Message<M extends MessageTypes, P = void> = { type: M; payload: P }

type GetDataObject = Message<'getData', GetData>

type AddDataObject = Message<'setData', SetData>

export type MessageTypesObjects = GetDataObject | AddDataObject
