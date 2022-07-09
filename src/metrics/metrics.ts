import client from 'prom-client'

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

export const prometheusClient = client
