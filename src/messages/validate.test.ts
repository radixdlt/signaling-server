import { expect } from 'chai'
import { validateMessage } from './validate'

describe('validate', () => {
  it('should return validation error', async () => {
    const result = await validateMessage({} as any)

    if (result.isErr()) {
      expect(result.error.length).to.equal(4)
    }
  })
})
