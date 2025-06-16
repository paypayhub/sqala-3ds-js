import { AuthenticationState, type Authentication, type Logger, type ThreeDSecureParameters } from '../types';

export type UseApiOptions = {
  baseUrl?: string
  publicKey: string
};

const FINAL_STATES = [
  AuthenticationState.Failed,
  AuthenticationState.AuthorizedToAttempt,
  AuthenticationState.Completed,
];

export class ApiService {
  constructor(
    private readonly baseUrl: string = 'https://api.sqala.tech/core/v1/threedsecure',
    private readonly publicKey: string,
    private readonly logger: Logger,
  ) { }

  executeAuthentication(parameters: ThreeDSecureParameters, externalAbortSignal: AbortSignal): AsyncIterableIterator<Authentication> {
    const logger = this.logger.bind(this);
    logger('ApiService: executeAuthentication (poll mode) - init');
    const baseURl = 'https://api-services.paypayhub.com/production/v1/three-ds/sqala/poll';
    const url = `${baseURl}/${parameters.id}?publicKey=${this.publicKey}`;
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
      [Symbol.asyncIterator]() {
        return this;
      },

      async next(): Promise<IteratorResult<Authentication>> {
        if (isTerminated || shouldStop) {
          return { done: true, value: undefined };
        }
        const MAX_RETRIES = 10;
        const RETRY_INTERVAL_MS = 800;
        let retries = 0;

        while (!isTerminated && !shouldStop && retries < MAX_RETRIES) {
          try {
            const response = await fetch(url, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
            });

            logger(`ApiService: attempt ${retries + 1} - statusCode: ${response.status}`);

            if (response.status === 202) {
              logger(`ApiService: attempt ${retries + 1} - Data not ready yet, will retry`);
              retries++;
              await new Promise(res => setTimeout(res, RETRY_INTERVAL_MS));
              continue;
            }

            if (!response.ok) {
              throw new Error(`Polling failed: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            const auth = data?.authentication as Authentication;

            logger('ApiService: received poll response', auth);

            if (FINAL_STATES.includes(auth.state)) {
              logger('ApiService: terminal state reached, will close');
              isTerminated = true;
            }

            return { done: false, value: auth };
          } catch (err) {
            logger('ApiService: polling error', err);
            throw err;
          }
        }

        return { done: true, value: undefined };
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
