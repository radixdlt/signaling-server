import { MessageError } from '../error';
import { ResultAsync } from 'neverthrow';
import { WebSocket } from 'ws';

export enum MessageType {
  GetData = 'getData',
  SetData = 'setData',
}

export type MessageTypes = GetData | AddData;

export type Message<M extends MessageType, P = void> = { type: M; payload: P };

export type GetData = Message<MessageType.GetData, { connectionId: string }>;

export type AddData = Message<
  MessageType.SetData,
  { connectionId: string; data: string }
>;

export type OkResponse = { ok: true; data?: string };
export type ErrorResponse = { ok: false; error: MessageError };
export type Response = OkResponse | ErrorResponse;

export type Dependencies = {
  getData: (connectionId: string) => ResultAsync<string | null, Error>;
  setData: (connectionId: string, data: string) => ResultAsync<null, Error>;
  publish: (connectionId: string) => ResultAsync<null, Error>;
  send: (response: Response) => void;
  ws: WebSocket;
};
