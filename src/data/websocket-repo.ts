import uWs from 'uWebSockets.js'

export const wsRepo = new Map<string, uWs.WebSocket>()
