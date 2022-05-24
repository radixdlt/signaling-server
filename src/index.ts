import { redisClient } from './redis';
import { log } from './log';
import { handleDataChannel, handleIncomingMessage, Response } from './messages';
import { config } from './config';
import { ErrorName } from './error';
import { websocketServer } from './websocketServer';

const app = async () => {
  const redis = redisClient();
  const connection = await redis.connect();
  const wss = websocketServer();

  // Crash the app if there is something wrong with the redis client connections
  if (connection.isErr()) {
    throw connection.error;
  }

  // TODO: handle redis errors
  redis.error$.subscribe((error) => {
    log.error({ errorName: ErrorName.RedisError, error });
  });

  // send data to clients when new data is available
  handleDataChannel({
    wss,
    getData: redis.getData,
    instanceId: config.instanceId,
  })(redis.data$).subscribe();

  wss.on('connection', (ws) => {
    log.trace({ event: `ClientConnected` });

    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (messageBuffer) => {
      await handleIncomingMessage({
        getData: redis.getData,
        setData: redis.setData,
        publish: (connectionId: string) => {
          const message = { connectionId, instanceId: config.instanceId };
          log.trace({ event: 'Publish', message });
          return redis.publish(config.redis.pubSubDataChannel)(
            JSON.stringify(message)
          );
        },
        send: (response: Response) => {
          log.trace({ event: 'Send', response });
          return ws.send(JSON.stringify(response));
        },
        ws,
      })(messageBuffer);
    });
  });
};

app();
