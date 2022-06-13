import { redisClient } from './redis'

export const dataFns = (
  getData: ReturnType<typeof redisClient>['getData'],
  setData: ReturnType<typeof redisClient>['setData'],
  publish: ReturnType<ReturnType<typeof redisClient>['publish']>
) => ({ getData, setData, publish })
