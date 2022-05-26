import { InferType, object, string } from "yup";

export const GetDataIO = object({
  connectionId: string().required()
})

export const SetDataIO = object({
  connectionId: string().required(),
  data: string().required()
})

export type GetData = InferType<typeof GetDataIO>
export type SetData = InferType<typeof SetDataIO>
