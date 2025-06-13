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
  private iFrame?: HTMLIFrameElement;
  private form?: HTMLFormElement;

  constructor(
    private readonly logger: Logger,
    private readonly base64Encoder = new Base64Encoder(),
  ) {}

  private getChallengeWindowSize(container: HTMLElement): ChallengeWindowSize {
    const width = container.clientWidth;
    if (width <= 250) return ChallengeWindowSize.H400xW250;
    if (width <= 390) return ChallengeWindowSize.H400xW390;
    if (width <= 500) return ChallengeWindowSize.H600xW500;
    if (width <= 600) return ChallengeWindowSize.H400xW600;
    return ChallengeWindowSize.Fullscreen;
  }

  async executeChallenge(authentication: Authentication, container: HTMLElement): Promise<void> {
    try {
      assert(authentication.acsUrl, 'acsUrl is required');
      this.logger('ChallengeService: acsUrl', authentication.acsUrl);

      if (this.form?.hasAttribute('data-submitted')) {
        this.logger('ChallengeService: form already submitted – skipping');
        return;
      }

      container.style.position = 'relative';

      const iframeName = v4();
      this.iFrame = this.createIFrame(iframeName);

      const formName = v4();
      this.form = this.createForm(authentication.acsUrl, formName, iframeName);

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'creq';

      const data = {
        threeDSServerTransID: authentication.transactionId,
        acsTransID: authentication.acsTransId,
        messageVersion: authentication.acsProtocolVersion,
        messageType: 'CReq',
        challengeWindowSize: this.getChallengeWindowSize(container),
      };

      input.value = this.base64Encoder.encode(data);
      this.form.appendChild(input);

      container.appendChild(this.form);
      container.appendChild(this.iFrame);

      const submitForm = new Promise<void>((resolve, reject) => {
        this.iFrame!.onload = () => resolve();
        this.iFrame!.onerror = () => reject(new Error('Failed to execute challenge'));

        this.form!.submit();
        this.form!.setAttribute('data-submitted', 'true');
      });

      await submitForm;
    } catch (error) {
      this.logger('ChallengeService: error', error);
      throw error;
    }
  }

  clean(): void {
    this.logger('ChallengeService: clean');
    try {
      this.iFrame?.remove();
      this.form?.remove();
      this.iFrame = undefined;
      this.form = undefined;
    } catch (error) {
      this.logger('ChallengeService: clean - error', error);
    }
  }

  private createIFrame(name: string): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    iframe.name = name;
    Object.assign(iframe.style, {
      width: '100%',
      height: '100%',
      position: 'absolute',
      top: '0',
      left: '0',
      border: 'none',
    });
    return iframe;
  }

  private createForm(action: string, name: string, target: string): HTMLFormElement {
    const form = document.createElement('form');
    form.name = name;
    form.target = target;
    form.action = action;
    form.method = 'POST';
    Object.assign(form.style, {
      display: 'none',
      visibility: 'hidden',
    });
    return form;
  }
}
