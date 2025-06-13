import { AuthenticationState, type Authentication, type Logger, type ThreeDSecureParameters } from '../types';

export type UseApiOptions = {
  baseUrl?: string
  publicKey: string
}

const FINAL_STATES = [
  AuthenticationState.Failed,
  AuthenticationState.AuthorizedToAttempt,
  AuthenticationState.Completed,
];

const eventStreamHeaders = {
  'Accept': 'text/event-stream',
  'Cache-Control': 'no-cache',
};

export class ApiService {
  constructor(
    private readonly baseUrl: string = 'https://api.sqala.tech/core/v1/threedsecure',
    private readonly publicKey: string,
    private readonly logger: Logger,
  ) { }

  executeAuthentication(parameters: ThreeDSecureParameters, externalAbortSignal: AbortSignal): AsyncIterableIterator<Authentication> {
    const logger = this.logger.bind(this);
    logger('ApiService: executeAuthentication - init');

    const url = `${this.baseUrl}/${parameters.id}/listen?publicKey=${this.publicKey}`;
    let isTerminated = false;
    let shouldStop = false;

    if (externalAbortSignal.aborted) {
      shouldStop = true;

    } else {
      externalAbortSignal.addEventListener('abort', () => {
        logger('ApiService: external abort signal received (will stop gracefully)');
        shouldStop = true;
      });
    }

    return {
      [Symbol.asyncIterator]() { return this; },

      async next(): Promise<IteratorResult<Authentication>> {
        if (isTerminated || shouldStop) {
          return { done: true, value: undefined };
        }
        return new Promise((resolve, reject) => {
          let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
          let hasResolved = false;

          const resolveOnce = (value: IteratorResult<Authentication>) => {
            if (hasResolved) {
              return
            }
            hasResolved = true;
            resolve(value);
          };

          const rejectOnce = (error: any) => {
            if (hasResolved) {
              return
            }
            hasResolved = true;
            reject(error);
          };


          fetch(url, { headers: eventStreamHeaders })
            .then(async (response) => {
              if (shouldStop) {
                resolveOnce({ done: true, value: undefined });
                return;
              }

              if (!response.ok || !response.body) {
                rejectOnce(new Error(`SSE connection failed: ${response.status} ${response.statusText}`));
                return;
              }

              logger('ApiService: SSE connection established');
              reader = response.body.getReader();
              const decoder = new TextDecoder('utf-8');
              let buffer = '';

              try {
                while (!shouldStop && !isTerminated && !hasResolved) {
                  const { value, done } = await reader.read();

                  if (done) {
                    logger('ApiService: stream ended naturally');
                    isTerminated = true;
                    resolveOnce({ done: true, value: undefined });
                    break;
                  }

                  if (shouldStop) {
                    logger('ApiService: stopping due to external signal');
                    break;
                  }
                  buffer += decoder.decode(value, { stream: true });
                  const events = buffer.split('\n\n');
                  buffer = events.pop() ?? '';

                  for (const event of events) {
                    if (shouldStop || isTerminated || hasResolved) {
                      break;
                    }
                    const lines = event.split('\n');
                    let data = '';

                    for (const line of lines) {
                      if (line.startsWith('data:')) {
                        data += line.slice(5).trim() + '\n';
                      }
                    }
                    data = data.trim();

                    if (data) {
                      try {
                        const auth = JSON.parse(data) as Authentication;
                        logger('ApiService: received authentication', auth);

                        if (FINAL_STATES.includes(auth.state)) {
                          logger('ApiService: terminal state reached, will close after this');
                          isTerminated = true;
                        }
                        resolveOnce({ done: false, value: auth });
                        return;

                      } catch (parseError) {
                        logger('ApiService: parse error', parseError);
                      }
                    }
                  }
                }
                if (!hasResolved) {
                  resolveOnce({ done: true, value: undefined });
                }
              } catch (error) {
                logger('ApiService: stream error', error);
                rejectOnce(error);

              } finally {
                if (reader) {
                  reader.cancel().catch(() => { });
                }
              }
            })
            .catch((error) => {
              logger('ApiService: fetch error', error);
              rejectOnce(error);
            });
        });
      }
    };
  }

  async setBrowserData(parameters: ThreeDSecureParameters) {
    this.logger('ApiService: setBrowserData', parameters);

    const buildBrowserData = (): Record<string, any> => {
      const allowedColorDepths = [48, 32, 24, 16, 15, 8, 4, 1];
      const colorDepth = allowedColorDepths.find(d => d <= screen.colorDepth) ?? 48;

      const { language, userAgent } = navigator;
      const { width, height } = window.screen;

      return {
        javaEnabled: true,
        javascriptEnabled: true,
        language,
        userAgent,
        screenWidth: width,
        screenHeight: height,
        timeZoneOffset: new Date().getTimezoneOffset(),
        colorDepth,
        acceptHeader: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      };
    };
    const browserData = buildBrowserData();
    this.logger('ApiService: browser data payload', browserData);

    const response = await fetch(`${this.baseUrl}/${parameters.id}/browser?publicKey=${this.publicKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(browserData),
    });

    this.logger('ApiService: browser data response', response);

    if (!response.ok) {
      throw new Error(`Failed to set browser data: ${response.status} ${response.statusText}`);
    }
  }

}
