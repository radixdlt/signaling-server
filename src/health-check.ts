import express from 'express'
import { config } from './config'

export const exposeHealthCheckEndpoint = () => {
  const app = express()

  app.get('/health', (req, res) => {
    res.send()
  })

  app.listen(config.healthCheckPort)
}
