import { connectedClientsGauge } from '../metrics/metrics'
import { WebSocketServer, WebSocket } from 'ws'
import { config } from '../config'
import { setToArray } from '../utils/utils'
import { log } from '../utils/log'
import { clientRepo, CreateDataChannel } from '../data'
import { Subscription } from 'rxjs'

declare module 'ws' {
  interface WebSocket {
    isAlive: boolean
    connectionId: string
    id: string
    dataChanel?: ReturnType<CreateDataChannel>
    dataChanelSubscription?: Subscription
    removeDataChanel?: () => void
  }
}

const handleClientHeartbeat = (wss: WebSocketServer) => () => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      log.trace({
        event: 'ClientDisconnected',
        clients: wss.clients.size,
      })
      connectedClientsGauge.set(wss.clients.size)
      if (ws.removeDataChanel) {
        ws.removeDataChanel()
      }
      clientRepo.remove(ws.connectionId, ws.id)
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
