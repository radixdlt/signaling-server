import { log } from './log'
import { WebSocketServer } from 'ws'
import { config } from './config'
import { setToArray } from './utils'

declare module 'ws' {
  interface WebSocket {
    isAlive: boolean
    connectionId: string
    id: string
  }
}

const handleClientHeartbeat = (wss: WebSocketServer) => () => {
  log.trace({ event: 'Heartbeat', clientsConnected: wss.clients.size })

  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      log.trace({ event: 'ClientTimeout' })
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

  return wss
}

export const getClientsByConnectionId =
  (wss: WebSocketServer) => (connectionId: string) =>
    setToArray(wss.clients).map((clients) =>
      clients.filter((client) => client.connectionId === connectionId)
    )
