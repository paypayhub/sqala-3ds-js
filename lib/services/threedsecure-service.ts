import {
  type Authentication,
  AuthenticationState,
  type Logger,
  type ThreeDSecureParameters,
  type ThreeDSecureResult,
} from '../types'
import { ApiServicePolling } from './api-service-polling'
import { DsMethodService } from './dsmethod-service'
import { ChallengeService } from './challenge-service'
import { Base64Encoder } from './base64-encoder'
import { v4 } from 'uuid'

export type ThreeDSecureOptions = {
  baseUrl?: string
  publicKey: string
  container: HTMLElement
}

export class ThreeDSecureService {
  private readonly container: HTMLElement
  private readonly apiService: ApiServicePolling
  private readonly dsMethodService: DsMethodService
  private readonly challengeService: ChallengeService
  private readonly actionMapping = new Map([
    [AuthenticationState.PendingDirectoryServer, this.handleDsMethod.bind(this)],
    [AuthenticationState.PendingChallenge, this.handleChallenge.bind(this)],
    [AuthenticationState.Failed, this.handleResult.bind(this)],
    [AuthenticationState.Completed, this.handleResult.bind(this)],
    [AuthenticationState.AuthorizedToAttempt, this.handleResult.bind(this)],
  ])

  constructor(
    options: ThreeDSecureOptions,
    private readonly logger: Logger = ThreeDSecureService.logger(),
  ) {
    this.logger('ThreeDSecureService: constructor', options)
    this.container = options.container
    this.apiService = new ApiServicePolling(this.logger, options.publicKey, options.baseUrl)
    this.dsMethodService = new DsMethodService(this.logger, new Base64Encoder())
    this.challengeService = new ChallengeService(this.logger, new Base64Encoder())
  }

  async execute(
    parameters: ThreeDSecureParameters,
    abortController: AbortController = new AbortController(),
  ): Promise<ThreeDSecureResult> {
    this.logger('ThreeDSecureService: execute')

    const fiveMinutes = 5 * 60 * 1000

    this.logger('ThreeDSecureService: execute - configuring timeout')
    const timeoutId = setTimeout(() => {
      abortController.abort('timeout')
    }, fiveMinutes)

    try {
      this.logger('ThreeDSecureService: setBrowserData', parameters)
      await this.apiService.setBrowserData(parameters)

      let authentication!: Authentication
      for await (authentication of this.apiService.executeAuthentication(parameters, abortController.signal)) {
        this.logger('ThreeDSecureService: flowStep', authentication)
        const action = this.actionMapping.get(authentication.state)
        await action?.(authentication, abortController)
        this.logger('ThreeDSecureService: flowStep - end')
      }

      abortController.abort('completed')

      return {
        id: authentication.id,
        transStatus: authentication.transStatus,
        transStatusReason: authentication.transStatusReason,
        authenticationValue: authentication.authenticationValue,
        eci: authentication.eci,
        dsTransId: authentication.dsTransId,
        protocolVersion: authentication.protocolVersion,
        failReason: authentication.failReason,
        isSuccess: () =>
          authentication.state === AuthenticationState.Completed ||
          authentication.state === AuthenticationState.AuthorizedToAttempt,
      }
    } catch (error) {
      this.logger('ThreeDSecureService: error', error)
      abortController.abort('error')
      throw error
    } finally {
      clearTimeout(timeoutId)
      this.challengeService.clean()
      this.dsMethodService.clean()
      this.logger('ThreeDSecureService: finally')
    }
  }

  private handleResult(authentication: Authentication, abortController: AbortController) {
    this.logger('ThreeDSecureService: handleResult', authentication)
    abortController.abort('completed')
    return Promise.resolve()
  }

  private handleDsMethod(authentication: Authentication, _: AbortController) {
    this.logger('ThreeDSecureService: handleDsMethod', authentication)
    return this.dsMethodService.executeDsMethod(authentication, this.container)
  }

  private handleChallenge(authentication: Authentication, _: AbortController) {
    this.logger('ThreeDSecureService: handleChallenge', authentication)
    return this.challengeService.executeChallenge(authentication, this.container)
  }

  private static logger(id: string = v4()) {
    return (message: string, ...rest: unknown[]) => {
      console.log(`[${id}]: ${message}`, ...rest)
    }
  }
}
