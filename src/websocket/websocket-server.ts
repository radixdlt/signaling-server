import { connectedClientsGauge } from '../metrics/metrics'
import { WebSocketServer, WebSocket } from 'ws'
import { config } from '../config'
import { setToArray } from '../utils/utils'
import { log } from '../utils/log'

declare module 'ws' {
  interface WebSocket {
    isAlive: boolean
    connectionId: string
    id: string
  }
}

const handleClientHeartbeat = (wss: WebSocketServer) => () => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      log.info({
        event: 'ClientDisconnected',
        clients: wss.clients.size,
      })
      connectedClientsGauge.set(wss.clients.size)
      return ws.terminate()
    }

    ws.isAlive = false
    ws.ping()
  })
}

export const websocketServer = () => {
  const wss = new WebSocketServer({ port: config.port })

  // ping clients to check if connection is still active
  const heartbeatInterval = setInterval(
    handleClientHeartbeat(wss),
    config.ws.heartbeatInterval
  )

  wss.on('close', function close() {
    clearInterval(heartbeatInterval)
  })

  const getClientsByConnectionId = (connectionId: string) =>
    setToArray<WebSocket>(wss.clients).map((clients) =>
      clients.filter((client) => client.connectionId === connectionId)
    )

  return { wss, getClientsByConnectionId }
}
