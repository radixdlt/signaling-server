import client from 'prom-client'
import gcStats from 'prometheus-gc-stats'

export const connectedClientsGauge = new client.Gauge({
  name: 'signaling_server_connected_clients',
  help: 'The number of connected clients',
})

export const incomingMessageCounter = new client.Counter({
  name: 'signaling_server_incoming_messages',
  help: 'Number of incoming messages',
})

export const outgoingMessageCounter = new client.Counter({
  name: 'signaling_server_outgoing_messages',
  help: 'Number of outgoing messages',
})

export const publishMessageCounter = new client.Counter({
  name: 'signaling_server_publish_messages',
  help: 'Number of published messages',
})

export const subscribeMessageCounter = new client.Counter({
  name: 'signaling_server_subscribe_messages',
  help: 'Number of subscribed messages',
})

export const redisGetKeyTime = new client.Gauge({
  name: 'signaling_server_redis_get_time',
  help: 'The time it takes in milliseconds for redis to get values from set',
})

export const redisSetTime = new client.Gauge({
  name: 'signaling_server_redis_set_time',
  help: 'The time it takes in milliseconds for redis to add value to set',
})

export const redisDeleteTime = new client.Gauge({
  name: 'signaling_server_redis_delete_time',
  help: 'The time it takes in milliseconds for redis to delete value from set',
})

export const redisPublishTime = new client.Gauge({
  name: 'signaling_server_redis_publish_time',
  help: 'The time it takes for redis to publish to data channel',
})

export const redisSubscribeTime = new client.Gauge({
  name: 'signaling_server_redis_subscribe_time',
  help: 'The time it takes for redis to subscribe to data channel',
})

gcStats(client.register, {
  prefix: 'signaling_server_',
})()

export const prometheusClient = client
