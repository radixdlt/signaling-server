import * as os from 'os'
import cluster from 'cluster'
import { log } from './utils/log'

export const spawn = () => {
  const numWorkes = os.cpus().length

  for (let i = 0; i < numWorkes; i += 1) {
    cluster.fork()
  }

  cluster.on('online', () => {
    log.info('Worker spawned')
  })

  cluster.on('exit', (worker, code, status) => {
    if (code === 0 || worker.exitedAfterDisconnect) {
      log.info(`Worker ${worker.process.pid} finished his job.`)
      return null
    }

    log.info(
      `Worker ${worker.process.pid} crashed with code ${code} and status ${status}.`
    )
    return cluster.fork()
  })
}
