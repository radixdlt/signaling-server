import { WebSocket } from 'ws'

type ConnectionId = string
type ClientId = string

const ClientRepo = () => {
  const connectionIdSet = new Map<ConnectionId, Map<ClientId, WebSocket>>()

  const add = (
    connectionId: string,
    clientId: string,
    websocket: WebSocket
  ) => {
    const registry = connectionIdSet.get(connectionId)

    if (registry) {
      registry.set(clientId, websocket)
    } else {
      connectionIdSet.set(connectionId, new Map().set(clientId, websocket))
    }
  }

  const remove = (connectionId: string, clientId: string) => {
    const registry = connectionIdSet.get(connectionId)
    if (registry) {
      registry.delete(clientId)
    }
  }

  const get = (connectionId: string, clientId: string) => {
    const registry = connectionIdSet.get(connectionId)
    if (registry) {
      return [...registry.entries()]
        .filter(([id]) => clientId !== id)
        .map(([, websocket]) => websocket)
    }
  }

  return { add, remove, get }
}

export const clientRepo = ClientRepo()
