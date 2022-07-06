import { WebSocketServer, WebSocket } from 'ws'
import { config } from '../config'
import { setToArray } from '../utils/utils'
import http from 'http'

import client from 'prom-client'
import { log } from '../utils/log'

const collectDefaultMetrics = client.collectDefaultMetrics
collectDefaultMetrics()

const httpServer = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200)
    res.end('ok')
  } else if (req.url === '/metrics') {
    res.writeHead(200)
    const metrics = await client.register.getMetricsAsJSON()
    res.end(JSON.stringify(metrics))
  } else {
    res.writeHead(404)
    res.end()
  }
})
httpServer.listen(config.port)

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
      return ws.terminate()
    }

    ws.isAlive = false
    ws.ping()
  })
}

export const websocketServer = () => {
  const wss = new WebSocketServer({ server: httpServer })

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
