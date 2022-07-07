import client from 'prom-client'

export const connectedClientsGauge = new client.Gauge({
  name: 'connected_clients',
  help: 'the number of connected clients',
})

export const incomingMessageCounter = new client.Counter({
  name: 'incoming_messages',
  help: 'number of incoming messages',
})

export const outgoingMessageCounter = new client.Counter({
  name: 'outgoing_messages',
  help: 'number of outgoing messages',
})

export const prometheusClient = client
