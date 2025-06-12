import { AuthenticationState, type Authentication, type Logger, type ThreeDSecureParameters } from '../types'
import { Bucket } from '../models'

export type UseApiOptions = {
  baseUrl?: string
  publicKey: string
}

export class ApiServicePolling {
  private pollingIntervalMs = 3000;

  constructor(
    private readonly logger: Logger,
    private readonly publicKey: string,
    private readonly baseUrl: string = 'https://api.sqala.tech/core/v1/threedsecure'
  ) { }

  executeAuthentication(parameters: ThreeDSecureParameters, abortSignal: AbortSignal): AsyncIterableIterator<Authentication> {
    const bucket = new Bucket<Authentication>();
    const logger = this.logger.bind(this);
    let pollingTimer: ReturnType<typeof setTimeout> | null = null;

    const stopPolling = () => {
      if (pollingTimer) clearTimeout(pollingTimer)
      bucket.close()
    }

    const poll = async () => {
      if (abortSignal.aborted) {
        logger('ApiService: executeAuthentication - aborted')
        return stopPolling()
      }

      try {
        const response = await fetch(
          `${this.baseUrl}/${parameters.id}/listen?publicKey=${this.publicKey}`,
          {
            method: 'GET',
            signal: abortSignal,
            headers: {
              'Accept': 'text/event-stream',
            },
          }
        );

        if (!response.ok) {
          logger(`ApiService:  failed with status ${response.status}`)
          return;
        }
        const text = await response.text();
        logger('ApiService: executeAuthentication - poll response text', text);

        const events = text
          .split('\n')
          .filter(line => line.startsWith('data: '))
          .map(line => line.replace(/^data:\s*/, ''))

        for (const eventJson of events) {
          try {
            const auth = JSON.parse(eventJson) as Authentication
            logger('ApiService: executeAuthentication - parsed auth', auth)

            bucket.push(auth)

            if (
              auth.state === AuthenticationState.Failed ||
              auth.state === AuthenticationState.AuthorizedToAttempt ||
              auth.state === AuthenticationState.Completed
            ) {
              return stopPolling()
            }
          } catch (err) {
            logger('ApiService: executeAuthentication - JSON parse error', err)
          }
        }
        pollingTimer = setTimeout(poll, this.pollingIntervalMs)

      } catch (err) {
        logger('ApiService: executeAuthentication - fetch error', err)
        stopPolling()
      }
    }
    poll()

    abortSignal.addEventListener('abort', () => {
      logger('ApiServicePolling: executeAuthentication - abort listener triggered');
      stopPolling();
    })

    return bucket.iterator;
  }

  async setBrowserData(parameters: ThreeDSecureParameters) {
    this.logger('ApiServicePolling: setBrowserData', parameters)

    const allowedBrowserColorDepth = [48, 32, 24, 16, 15, 8, 4, 1]
    const colorDepth = allowedBrowserColorDepth.find((x) => x <= screen.colorDepth) ?? 48
    const browser = {
      javaEnabled: true,
      javascriptEnabled: true,
      language: navigator.language,
      userAgent: navigator.userAgent,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      timeZoneOffset: new Date().getTimezoneOffset(),
      colorDepth,
      acceptHeader:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    }
    this.logger('ApiServicePolling: setBrowserData - browser', browser);

    const response = await fetch(`${this.baseUrl}/${parameters.id}/browser?publicKey=${this.publicKey}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(browser),
    });
    this.logger('ApiServicePolling: setBrowserData - response', response);
    if (!response.ok) {
      throw new Error('Failed to set browser data');
    }
  }
}
