import { z, object, string } from 'zod'

export const GetDataIO = object({
  connectionId: string(),
})

export const SetDataIO = object({
  connectionId: string(),
  data: string(),
})

export type GetData = z.infer<typeof GetDataIO>
export type SetData = z.infer<typeof SetDataIO>
