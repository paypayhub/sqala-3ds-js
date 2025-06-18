import type { Authentication, Logger } from '../types';
import { assert, Base64Encoder } from './utils';
import { v4 } from 'uuid';

export enum ChallengeWindowSize {
  H400xW250 = '01',
  H400xW390 = '02',
  H600xW500 = '03',
  H400xW600 = '04',
  Fullscreen = '05',
}

export class ChallengeService {
  private iFrame!: HTMLIFrameElement
  private form!: HTMLFormElement

  constructor(
    private readonly logger: Logger,
    private readonly base64Encoder = new Base64Encoder(),
  ) {}

  private getChallengeWindowSize(container: HTMLElement) {
    return (
      (container.clientWidth <= 250 && ChallengeWindowSize.H400xW250) ||
      (container.clientWidth <= 390 && ChallengeWindowSize.H400xW390) ||
      (container.clientWidth <= 500 && ChallengeWindowSize.H600xW500) ||
      (container.clientWidth <= 600 && ChallengeWindowSize.H400xW600) ||
      ChallengeWindowSize.Fullscreen
    )
  }

  async executeChallenge(authentication: Authentication, container: HTMLElement) {
    try {
      assert(authentication.acsUrl, 'acsUrl is required')

      if (this.form?.hasAttribute('data-submitted')) {
        return
      }

      container.style.position = 'relative'

      this.iFrame = document.createElement('iframe')
      this.iFrame.name = v4()
      this.iFrame.style.width = '100%'
      this.iFrame.style.height = '100%'
      this.iFrame.style.position = 'absolute'
      this.iFrame.style.top = '0'
      this.iFrame.style.left = '0'

      this.form = document.createElement('form')
      this.form.style.visibility = 'hidden'
      this.form.name = v4()
      this.form.target = this.iFrame.name
      this.form.action = authentication.acsUrl
      this.form.method = 'POST'

      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = 'creq'
      this.form.appendChild(input)

      const data = {
        threeDSServerTransID: authentication.transactionId,
        acsTransID: authentication.acsTransId,
        messageVersion: authentication.acsProtocolVersion,
        messageType: 'CReq',
        challengeWindowSize: this.getChallengeWindowSize(container),
      }

      input.value = this.base64Encoder.encode(data)

      container.appendChild(this.form)
      container.appendChild(this.iFrame)

      const submitForm = new Promise<void>((resolve, reject) => {
        this.iFrame.onload = () => {
          resolve()
        }

        this.iFrame.onerror = () => {
          reject(new Error('Failed to execute challenge'))
        }

        this.form.submit()
        // Execute challenge only once, be resilient to PENDING_CHALLENGE event
        // being sent more than once, just do a no-op afterwards
        this.form.setAttribute('data-submitted', 'true')
      })

      await submitForm
    } catch (error) {
      this.logger('ChallengeService: error', error)
      throw error
    }
  }

  clean() {
    this.logger('ChallengeService: clean')
    try {
      this.iFrame?.remove()
      this.form?.remove()
    } catch (error) {
      this.logger('ChallengeService: clean - error', error)
    }
  }
}