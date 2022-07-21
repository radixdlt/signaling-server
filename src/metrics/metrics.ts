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

gcStats(client.register, {
  prefix: 'signaling_server',
})()

export const prometheusClient = client
