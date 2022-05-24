import { err, ok, Result } from 'neverthrow';

export const bufferToString = (
  buffer: Buffer | ArrayBuffer | Buffer[]
): Result<string, Error> => {
  try {
    return ok(buffer.toString());
  } catch (error) {
    return err(error as Error);
  }
};

export const parseJSON = <T>(text: string): Result<T, Error> => {
  try {
    return ok(JSON.parse(text));
  } catch (error) {
    return err(error as Error);
  }
};

export const setToArray = <T>(set: Set<T>): Result<T[], Error> => {
  try {
    return ok([...set.values()]);
  } catch (error) {
    return err(error as Error);
  }
};
