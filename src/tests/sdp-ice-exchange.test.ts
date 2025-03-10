import {
  forkJoin,
  map,
  merge,
  ReplaySubject,
  Subject,
  switchMap,
  take,
  tap,
} from 'rxjs'
import { expect } from 'chai'
import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import { Message } from '../messages/io-types'
import {
  MessageTypes,
  RemoteClientIsAlreadyConnected,
  RemoteClientJustConnected,
} from '../messages/_types'

/**
 * ==============================
 * webRTC SDP + ICE exchange flow
 * ==============================
 * In order for clients to establish a webRTC connection they need to know about each other.
 * The following test simulates 2 clients exchanging that SDP and ICE candidates while being
 * connected to different signaling service instances.
 */

const connectionId =
  'de0ced0cc6514ae8f79a571983911de623e87f8d84e4da561701916708702f49'

let client1Target = ''
let client2Target = ''

const OFFER: Message = {
  encryptedPayload:
    '8ab7f0f7f46444b3ce4ad64bfaa080b7607ef4435c6c6d20b50f71304a191dece0d77d44be25541b0fb96a8d14c86595f209d2c3e40a43595ea447a9c8fa403fc4dbdf44a7845f625ce6183b542952caa10cab231424080bdcef45228e0d4643541aeb392472a328d263a622d0e30bd309799e9dd11a7795fefed9e864cfae2fc2dfc3acb6835ba4ffbf2a8907d12dd9bb31920744d173084993cfde0116c3b2e273766157618294d5657540030c357a7e87287b1a0e3d4ecf12847465f82bc7740a385da984143c45218cc83dd3c1bebe6abcdfe126edb69a73fc0a917ebeb946cebfbb87172759f8a5e08de4264433add8990292e8f4688ed31a156f89c332c52b2e495736754bd77d4526291559d933dce4dacbee60dd31bec59de3eaee280e73695cf2e1b4d3aa1f9670691b4793b49f983b483391e2c937b961862cdfbcfb2218fb4b167b767d084e44baac4e4a2d87bf4ceaa04cd4e40d3b77e717ae207f6033fdd488e6cd50f251ce2b8cd6eee15645c4fe22f3acc1a96b79bee64ff8d67bc18eb6a47b8694642fc3e82cf10cd366eac433c5d4d7d6e4405e76ea30d1ffc297420929927e033eedbd1fff81445d12aa0c877018b3737a22bbc0efa3f175819e1a63f0073e5a96bb5f5c986bab05d65b84abebd8ccd4f5081f9d846bf20982d434774b68ae014326b1e174801ebc1daa173708ac9898b47936c7eea5b9874e9ec9e757727ac80fb596e806cac2f36bc042a2c8c5b4726f4552915d76be4e',
  connectionId,
  method: 'offer',
  source: 'wallet',
  targetClientId: '',
  requestId: randomUUID(),
}

const ICE_CANDIDATE: Message = {
  encryptedPayload:
    '8090be8fad3f11789665bd74d6b03fe42f99d35fc8d045ac319400e25137ec9f2c834e612333519fd32a6300d058f613059dceca4c0464b25ad9cf467ca23c15d0dca5aad5e650aec08c394880139e6d61cd751ae743e1d4161bcf6b0a583d43569bb35d09464f36fff3b1af229741c3435818dd56e24559b0ec425df9d252124b99a02e7468ed74cf85ae090d27dd5edb4b50add1c575bfb309e3990e367b787bfd388abcaf3dc3751b5c6922b0a3190b1f1dabde788f911d532a6560f6d074cab9a3',
  connectionId,
  method: 'iceCandidate',
  source: 'wallet',
  targetClientId: '',
  requestId: randomUUID(),
}

const ANSWER: Message = {
  requestId: randomUUID(),
  method: 'answer',
  source: 'extension',
  targetClientId: '',
  connectionId,
  encryptedPayload:
    '040c05cab39f2dacc07c26925669fc3b8008e35fd684a7514e2469a54655e0e27516da5f32da07499405c5ab12ba6326b9476c81f351b53cdb42508482ce47fbd163ce8340ba5d1366f9aa43ae7eae08366e40cd27129ea79ecafa8f5470789aa14504c8405bae8fe1898d38e518b1cfa972b94fc8465a38e19ab02aef68d2f645557a6c3c135cee86afb46dde39cc0047c68849a0986d7c12dac9501b3ff7c00f98e750a8deb4d1fca31afb952d1e7be6e56031e68d5b522492e1032330402a6606338992fbbbf54b921fbd191027cf50fc02fd5e672a5fd5209dc9ddb1db6b182152e1d9c555cf3ae2bd70b5208582157f091a6de722721f739f02393cc22f23372ef42d28416bcfd45f25bc5c9e9fad47da6c3d2e985ed8dcb5069b7541a7f51d0eb2a5400e3039f66e5e1f7b1e5e7d71a3feb9955d46dd62133d6c589793c9ee5968e92ab203f982e309df8a4dfd9ae39018958616c4fda54be76927c7868c49365ce33a542f153baca47ac95f3deac6da0ba43afb8f0b81635db499701ae7c0d73d7ca99db14f9963e23995d994d34eb22b4ead5f1c56f949ec440638ce4bb47e751ca575d835b42d33759cf3e66800bfc7a9bdea1a3f89a0ed372102e36a9824113c07a631e6ce618c23581ec263a7c070caaddca2b6b9cd087dab214de2652f45edd495c432caa55e16fb33e2e29bf77f6b88de5e89495e56e6577087a76d5029f84e920a2329e1bf32810cf5b5',
}

const createMessage = (
  method: Message['method'],
  source: Message['source']
) => {
  switch (method) {
    case 'answer':
      return {
        ...ANSWER,
        source,
        requestId: randomUUID(),
        encryptedPayload: 'abc',
      }

    case 'offer':
      return {
        ...OFFER,
        source,
        requestId: randomUUID(),
        encryptedPayload: 'abc',
      }

    case 'iceCandidate':
      return {
        ...ICE_CANDIDATE,
        source,
        requestId: randomUUID(),
        encryptedPayload: 'abc',
      }

    default:
      throw new Error('invalid method')
  }
}

const createClient = (url: string) => {
  const ws = new WebSocket(url)
  const messageSubject = new Subject<MessageTypes>()
  const connectedSubject = new ReplaySubject<boolean>()

  ws.onmessage = (event) => {
    messageSubject.next(JSON.parse(event.data.toString()))
  }

  ws.onopen = () => {
    connectedSubject.next(true)
  }

  const send = (message: any) => {
    ws.send(JSON.stringify(message))
  }

  return {
    send,
    message$: messageSubject.asObservable(),
    connected$: connectedSubject.asObservable(),
  }
}

const getNextMessage = (
  messages: {
    client: 'client1' | 'client2'
    message: Message
  }[]
) => messages.shift()

describe('webRTC SDP exchange', () => {
  it('should simulate an exchange of SDP and ICE between two clients', (done) => {
    // Arrange
    const client1 = createClient(
      `ws://localhost:4000/${connectionId}?target=wallet&source=extension`
    )
    const client2 = createClient(
      `ws://localhost:4100/${connectionId}?target=extension&source=wallet`
    )

    const clients = { client1, client2 }

    const messagesToSend: {
      client: 'client1' | 'client2'
      message: Message
    }[] = [
      {
        client: 'client2',
        message: createMessage('offer', 'wallet'),
      },
      {
        client: 'client2',
        message: createMessage('iceCandidate', 'wallet'),
      },
      {
        client: 'client2',
        message: createMessage('iceCandidate', 'wallet'),
      },
      {
        client: 'client2',
        message: createMessage('iceCandidate', 'wallet'),
      },
      {
        client: 'client1',
        message: createMessage('answer', 'extension'),
      },
      {
        client: 'client1',
        message: createMessage('iceCandidate', 'extension'),
      },
      {
        client: 'client1',
        message: createMessage('iceCandidate', 'extension'),
      },
      {
        client: 'client1',
        message: createMessage('iceCandidate', 'extension'),
      },
    ]

    const sendNextMessage = () => {
      const nextMessage = getNextMessage(messagesToSend)
      if (nextMessage) {
        console.log(
          `⬆️ ${nextMessage.client} SENDING \t${nextMessage.message.method} \t${nextMessage.message.requestId}\n`
        )
        nextMessage.message.targetClientId =
          nextMessage.client === 'client1' ? client1Target : client2Target
        clients[nextMessage.client].send(nextMessage.message)
      }
    }

    const handleMessageReceived = (
      client: 'client1' | 'client2',
      message: MessageTypes
    ): void => {
      console.log(
        `⬇️ ${client} RECEIVED \t ${message.info} \t ${
          'requestId' in message ? message.requestId : ''
        }\n`
      )
      actualMessages[client].push(message)
    }

    const assertActualMatchExpected = (client: 'client1' | 'client2') => {
      expectedMessages[client].forEach((message) => {
        const exists = actualMessages[client].some(
          (m: any) => message.requestId === m.requestId
        )
        if (!exists) {
          console.log(
            `❌ ${client} didn't find \t ${message.info} \t${message.requestId}`
          )
          throw new Error('message missing')
        }
        expect(exists).to.be.true
      })
    }

    const client1Messages = messagesToSend.filter(
      (item) => item.client === 'client1'
    )
    const client2Messages = messagesToSend.filter(
      (item) => item.client === 'client2'
    )

    const expectedMessages: Record<'client1' | 'client2', any[]> = {
      client1: [
        {
          info: 'RemoteData',
          data: client2Messages[0].message,
          requestId: client2Messages[0].message.requestId,
        },
        {
          info: 'RemoteData',
          data: client2Messages[1].message,
          requestId: client2Messages[1].message.requestId,
        },
        {
          info: 'RemoteData',
          data: client2Messages[2].message,
          requestId: client2Messages[2].message.requestId,
        },
        {
          info: 'RemoteData',
          data: client2Messages[3].message,
          requestId: client2Messages[3].message.requestId,
        },
        {
          info: 'Confirmation',
          requestId: client1Messages[0].message.requestId,
        },
        {
          info: 'Confirmation',
          requestId: client1Messages[1].message.requestId,
        },
        {
          info: 'Confirmation',
          requestId: client1Messages[2].message.requestId,
        },
        {
          info: 'Confirmation',
          requestId: client1Messages[3].message.requestId,
        },
      ],
      client2: [
        {
          info: 'Confirmation',
          requestId: client2Messages[0].message.requestId,
        },
        {
          info: 'Confirmation',
          requestId: client2Messages[1].message.requestId,
        },
        {
          info: 'Confirmation',
          requestId: client2Messages[2].message.requestId,
        },
        {
          info: 'Confirmation',
          requestId: client2Messages[3].message.requestId,
        },
        {
          info: 'RemoteData',
          data: client1Messages[0].message,
          requestId: client1Messages[0].message.requestId,
        },
        {
          info: 'RemoteData',
          data: client1Messages[1].message,
          requestId: client1Messages[1].message.requestId,
        },
        {
          info: 'RemoteData',
          data: client1Messages[2].message,
          requestId: client1Messages[2].message.requestId,
        },
        {
          info: 'RemoteData',
          data: client1Messages[3].message,
          requestId: client1Messages[3].message.requestId,
        },
      ],
    }

    const actualMessages: Record<'client1' | 'client2', MessageTypes[]> = {
      client1: [],
      client2: [],
    }

    const expectedMessagesLength =
      expectedMessages.client1.length + expectedMessages.client2.length

    // Act
    forkJoin([client1.message$.pipe(take(1)), client2.message$.pipe(take(1))])
      .pipe(
        map(
          (messages) =>
            messages as [
              RemoteClientJustConnected,
              RemoteClientIsAlreadyConnected
            ]
        ),
        tap(([client1, client2]) => {
          client1Target = client1.remoteClientId
          client2Target = client2.remoteClientId
          sendNextMessage()
        }),
        switchMap(() =>
          merge(
            client1.message$.pipe(
              tap((message) => handleMessageReceived('client1', message))
            ),
            client2.message$.pipe(
              tap((message) => handleMessageReceived('client2', message))
            )
          ).pipe(
            tap(() => {
              const actualMessagesLength =
                actualMessages.client1.length + actualMessages.client2.length

              if (messagesToSend.length) {
                sendNextMessage()
              } else if (expectedMessagesLength === actualMessagesLength) {
                // Assert
                assertActualMatchExpected('client1')
                assertActualMatchExpected('client2')
                done()
              }
            })
          )
        )
      )
      .subscribe()
  })
})
