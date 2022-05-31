import { ResultAsync } from 'neverthrow'

export const dataFns = (
  getData: (key: string) => ResultAsync<string | null, Error>,
  setData: (key: string, value: string) => ResultAsync<null, Error>,
  publish: (message: string) => ResultAsync<null, Error>
) => ({ getData, setData, publish })
