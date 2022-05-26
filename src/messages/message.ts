import { ResultAsync } from 'neverthrow';
import { bufferToString, parseJSON } from '../utils';
import { ErrorName, handleMessageError, MessageError } from '../error';
import { RawData, WebSocketServer } from 'ws';
import { validateMessage } from './validate';
import { Dependencies, MessageTypesObjects } from './_types';
import { getClientsByConnectionId } from '../websocketServer';
import { log } from '../log';
import { map, Observable } from 'rxjs';

const parseMessage = (text: string) =>
  parseJSON<MessageTypesObjects>(text).mapErr(
    handleMessageError({
      name: ErrorName.InvalidJsonError,
      errorMessage: `unable to parse message: ${text}`,
    })
  );

const handleMessage =
  ({ getData, setData, publish, send }: Dependencies) =>
  (message: MessageTypesObjects): ResultAsync<null | string, MessageError> => {
    switch (message.type) {
      case 'GetData':
        return getData(message.payload.connectionId)
          .mapErr(
            handleMessageError({
              message,
              name: ErrorName.GetDataError,
              handler: 'GetData',
            })
          )
          .map((data) => {
            if (data) {
              send({ ok: true, data });
            }
            return data;
          });

      case 'SetData':
        return setData(message.payload.connectionId, message.payload.data)
          .map(() => {
            send({ ok: true });
          })
          .mapErr(
            handleMessageError({
              message,
              name: ErrorName.AddDataError,
              handler: 'SetData',
              errorMessage: `could not add data for connectionId: ${message.payload.connectionId}`,
            })
          )
          .andThen(() =>
            publish(message.payload.connectionId).mapErr((error) => {
              return handleMessageError({
                message,
                name: ErrorName.PublishError,
                handler: 'SetData',
                errorMessage: `could not publish for connectionId: ${message.payload.connectionId}`,
              })(error);
            })
          );

      default:
        throw new Error(`handler missing for messageType: ${message['type']}`);
    }
  };

export const handleIncomingMessage =
  (dependencies: Dependencies) =>
  (buffer: RawData): ResultAsync<null | string, MessageError> =>
    bufferToString(buffer)
      .mapErr(handleMessageError({ name: ErrorName.MessageConversionError }))
      .andThen(parseMessage)
      .andThen(validateMessage)
      .map((message) => {
        // add connectionId to websocket
        if (message.payload.connectionId) {
          dependencies.ws.connectionId = message.payload.connectionId;
        }
        return message;
      })
      .asyncAndThen(handleMessage(dependencies))
      .mapErr((error) => {
        dependencies.send({ ok: false, error });
        return error;
      });

type DataChannelMessage = {
  connectionId: string;
  instanceId: string;
  clientId: string;
};

const parseDataChannelMessage = (rawMessage: string) =>
  parseJSON<DataChannelMessage>(rawMessage).mapErr((error) => {
    log.error({
      event: 'Subscribe',
      errorName: ErrorName.InvalidJsonError,
      error,
    });
  });

export const sendDataToClients =
  ({
    getClients,
    getData,
    instanceId,
  }: {
    instanceId: string;
    getClients: ReturnType<typeof getClientsByConnectionId>;
    getData: (connectionId: string) => ResultAsync<string | null, Error>;
  }) =>
  (rawMessage: string) =>
    parseDataChannelMessage(rawMessage).map((message) => {
      log.trace({ message, instanceId });

      log.trace({ event: 'Subscribe', message });

      getData(message.connectionId).andThen((data) =>
        getClients(message.connectionId).map((clients) => {
          if (data) {
            for (const client of clients) {
              if (client.id !== message.clientId) {
                client.send(JSON.stringify({ ok: true, data }));
              }
            }
          }
        })
      );
    });

export const handleDataChannel =
  ({
    wss,
    getData,
    instanceId,
  }: {
    wss: WebSocketServer;
    getData: (connectionId: string) => ResultAsync<string | null, Error>;
    instanceId: string;
  }) =>
  (message$: Observable<string>) =>
    message$.pipe(
      map(
        sendDataToClients({
          getClients: getClientsByConnectionId(wss),
          getData,
          instanceId,
        })
      )
    );
