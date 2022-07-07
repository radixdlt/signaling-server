import { config } from '../config'
import http from 'http'
import { prometheusClient } from '../metrics/metrics'

export const httpServer = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200)
    res.end('ok')
  } else if (req.url === '/metrics') {
    res.writeHead(200)
    const metrics = await prometheusClient.register.getMetricsAsJSON()
    res.end(JSON.stringify(metrics))
  } else {
    res.writeHead(404)
    res.end()
  }
})

httpServer.listen(config.port)
