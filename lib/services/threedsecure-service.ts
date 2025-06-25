import { v4 } from 'uuid'
import {
  type Authentication,
  AuthenticationState,
  type Logger,
  type ThreeDSecureParameters,
  type ThreeDSecureResult,
} from '../types'
import { ApiService } from './api-service'
import { ChallengeService } from './challenge-service'
import { DsMethodService } from './dsmethod-service'
import { Base64Encoder, delay } from './utils'

export type ThreeDSecureOptions = {
  baseUrl?: string
  publicKey: string
  container: HTMLElement,
  eventHandler: (event: string, ...params: any) => void,
};

export class ThreeDSecureService {

  private readonly container: HTMLElement
  private readonly apiService: ApiService
  private readonly dsMethodService: DsMethodService
  private readonly challengeService: ChallengeService
  private readonly actionMapping = new Map([
    [AuthenticationState.PendingDirectoryServer, this.handleDsMethod.bind(this)],
    [AuthenticationState.PendingChallenge, this.handleChallenge.bind(this)],
    [AuthenticationState.Failed, this.handleResult.bind(this)],
    [AuthenticationState.Completed, this.handleResult.bind(this)],
    [AuthenticationState.AuthorizedToAttempt, this.handleResult.bind(this)],
  ])
  private isRunning = false;
  private logger: Logger;

  constructor(options: ThreeDSecureOptions) {
    this.logger = ThreeDSecureService.logger(v4(), options.eventHandler);
    this.logger('ThreeDSecureService: constructor', options);

    this.container = options.container;
    this.apiService = new ApiService(options.baseUrl, options.publicKey, this.logger);
    this.dsMethodService = new DsMethodService(this.logger, new Base64Encoder());
    this.challengeService = new ChallengeService(this.logger, new Base64Encoder());
  }

  async execute(parameters: ThreeDSecureParameters, abortController: AbortController = new AbortController()): Promise<ThreeDSecureResult> {
    if (this.isRunning) {
      throw new Error('ThreeDSecureService is already running');
    }
    this.isRunning = true;
    this.logger('ThreeDSecureService V9: execute')

    const fiveMinutes = 5 * 60 * 1000;
    this.logger('ThreeDSecureService: execute - configuring timeout');
    const timeoutId = setTimeout(() => { abortController.abort('timeout') }, fiveMinutes);

    try {
      this.logger('ThreeDSecureService: setBrowserData', parameters)
      await this.apiService.setBrowserData(parameters)

      let authentication!: Authentication;
      const iterator = this.apiService.executeAuthentication(parameters, abortController.signal);

      while (true) {
        const result = await iterator.next();
        this.logger(`ThreeDSecureService: while loop - continue: ${result.done}`);

        if (result.done) {
          break;
        }
        authentication = result.value;
        this.logger(`ThreeDSecureService: flowStep - ${authentication.state} - start`, authentication);
        const action = this.actionMapping.get(authentication.state);
        await action?.(authentication, abortController);
        this.logger(`ThreeDSecureService: flowStep - ${authentication.state} - end`);
        await delay(/PENDING_CHALLENGE/.test(authentication.state) ? 2250 : 5000);
      }

      this.logger('ThreeDSecureService: authentication completed successfully');

      return {
        id: authentication.id,
        transStatus: authentication.transStatus,
        transStatusReason: authentication.transStatusReason,
        authenticationValue: authentication.authenticationValue,
        eci: authentication.eci,
        dsTransId: authentication.dsTransId,
        protocolVersion: authentication.protocolVersion,
        failReason: authentication.failReason,
        isSuccess: () => authentication.state === AuthenticationState.Completed || authentication.state === AuthenticationState.AuthorizedToAttempt,
      }
    } catch (error) {
      this.logger('ThreeDSecureService: error', error);
      abortController.abort('error');
      throw error;

    } finally {
      clearTimeout(timeoutId);
      this.challengeService.clean();
      this.dsMethodService.clean();
      this.isRunning = false;
      this.logger('ThreeDSecureService: finally');
    }
  }

  private handleResult(authentication: Authentication, abortController: AbortController) {
    this.logger('ThreeDSecureService: handleResult', authentication);
    abortController.abort('completed');
    return Promise.resolve();
  }

  private handleDsMethod(authentication: Authentication, _: AbortController) {
    this.logger('ThreeDSecureService: handleDsMethod', authentication);
    return this.dsMethodService.executeDsMethod(authentication, this.container);
  }

  private handleChallenge(authentication: Authentication, _: AbortController) {
    this.logger('ThreeDSecureService: handleChallenge', authentication);
    return this.challengeService.executeChallenge(authentication, this.container);
  }

  private static logger(id: string = v4(), eventHandler: (event: string, ...params: any) => void) {
    return (message: string, ...rest: unknown[]) => {
      console.log(`[${id}]: ${message}`, ...rest);

      if (/ThreeDSecureService/.test(message) && rest?.length > 0) {
        eventHandler(/error/.test(message) ? 'error' : 'step', ...rest);
      }

    }
  }
}
