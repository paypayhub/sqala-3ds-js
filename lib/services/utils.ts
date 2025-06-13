
export class Base64Encoder {
  encode(data: object): string {
    const base64 = btoa(JSON.stringify(data));
    return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
}

export const delay = (milliseconds: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};

export function assert(condition: unknown, msg?: string | Error): asserts condition {
  if (condition) {
    return;
  }

  if (msg instanceof Error) {
    throw msg;
  }

  throw new Error(msg ?? 'Assertion failed');
}