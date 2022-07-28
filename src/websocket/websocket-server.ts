import { connectedClientsGauge } from '../metrics/metrics'
import { WebSocketServer, WebSocket } from 'ws'
import { config } from '../config'
import { setToArray } from '../utils/utils'
import { log } from '../utils/log'
import { DataChannelRepoType } from 'data/data-channel-repo'

declare module 'ws' {
  interface WebSocket {
    isAlive: boolean
    id: string
  }
}

export const websocketServer = (
  dataChannelRepo: DataChannelRepoType,
  wsRepo: Map<string, WebSocket>
) => {
  const wss = new WebSocketServer({ port: config.port })

  const handleClientHeartbeat = (wss: WebSocketServer) => () => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        log.info({
          event: 'ClientDisconnected',
          clients: wss.clients.size,
        })
        connectedClientsGauge.set(wss.clients.size)
        // dataChannelRepo.remove(ws)
        wsRepo.delete(ws.id)
        return ws.terminate()
      }

      ws.isAlive = false
      ws.ping()
    })
  }

  // ping clients to check if connection is still active
  const heartbeatInterval = setInterval(
    handleClientHeartbeat(wss),
    config.ws.heartbeatInterval
  )

  wss.on('close', function close() {
    clearInterval(heartbeatInterval)
  })

  return { wss }
}
