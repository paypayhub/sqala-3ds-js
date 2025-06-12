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
  ) {}

  executeAuthentication(parameters: ThreeDSecureParameters, abortSignal: AbortSignal): AsyncIterableIterator<Authentication> {
    const bucket = new Bucket<Authentication>();
    const logger = this.logger.bind(this);

    let pollingTimer: number | null = null;
    let lastState: AuthenticationState | null = null;

    const stopPolling = () => {
      if (pollingTimer) clearTimeout(pollingTimer)
      bucket.close()
    }

    const poll = async () => {
      if (abortSignal.aborted) {
        logger('ApiServicePolling: executeAuthentication - aborted');
        return stopPolling();
      }

      try {
        const response = await fetch(`${this.baseUrl}/${parameters.id}/status?publicKey=${this.publicKey}`, {
          method: 'GET',
          signal: abortSignal,
          headers: {
            'Accept': 'application/json',
          },
        })

        if (!response.ok) {
          logger(`ApiServicePolling: error with HTTP statusCode: ${response.status}`);
          return;
        }

        const auth = (await response.json()) as Authentication
        logger('ApiServicePolling: executeAuthentication - poll result', auth)

        if (auth.state !== lastState) {
          lastState = auth.state
          bucket.push(auth)
        }

        if (
          auth.state === AuthenticationState.Failed ||
          auth.state === AuthenticationState.AuthorizedToAttempt ||
          auth.state === AuthenticationState.Completed
        ) {
          return stopPolling()
        }

        // Schedule next poll
        pollingTimer = setTimeout(poll, this.pollingIntervalMs)
      } catch (error) {
        logger('ApiServicePolling: executeAuthentication - poll error', error)
        return stopPolling()
      }
    }

    // Start polling
    poll()

    // Stop polling if aborted
    abortSignal.addEventListener('abort', () => {
      logger('ApiServicePolling: executeAuthentication - abort listener triggered')
      stopPolling()
    })

    return bucket.iterator
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
    this.logger('ApiServicePolling: setBrowserData - browser', browser)

    const response = await fetch(`${this.baseUrl}/${parameters.id}/browser?publicKey=${this.publicKey}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(browser),
    })
    this.logger('ApiServicePolling: setBrowserData - response', response)
    if (!response.ok) {
      throw new Error('Failed to set browser data')
    }
  }
}
