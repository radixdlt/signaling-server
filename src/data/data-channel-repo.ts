import { WebSocket } from 'ws'
import { v4 } from 'uuid'
import { CreateDataChannel } from './redis'
import { okAsync, ResultAsync } from 'neverthrow'

export type DataChannelRepoType = ReturnType<typeof DataChannelRepo>

export const DataChannelRepo = (createDataChannel: CreateDataChannel) => {
  const dataChannels = new Map<
    WebSocket,
    { unsubscribe: () => ResultAsync<void, Error>; id: string }
  >()

  const getId = (ws: WebSocket) => {
    const dataChannel = dataChannels.get(ws)
    if (dataChannel) return dataChannel.id
  }

  const add = (
    ws: WebSocket,
    onMessage: (message: string) => void
  ): ResultAsync<string, Error> => {
    const id = v4()
    return createDataChannel(id, onMessage).map((dataChannel) => {
      dataChannels.set(ws, { unsubscribe: dataChannel.unsubscribe, id })
      return id
    })
  }

  const remove = (ws: WebSocket): ResultAsync<void, Error> => {
    const dataChannel = dataChannels.get(ws)
    if (dataChannel) {
      return dataChannel.unsubscribe().map(() => {
        dataChannels.delete(ws)
      })
    }
    return okAsync(undefined)
  }

  return { add, remove, getId }
}
