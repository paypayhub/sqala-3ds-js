import { v4 } from 'uuid';
import type { Authentication, Logger } from '../types';
import type { Base64Encoder } from './utils';
import { assert } from './utils';

export class DsMethodService {
  private iFrame?: HTMLIFrameElement;
  private form?: HTMLFormElement;

  constructor(
    private readonly logger: Logger,
    private readonly base64Encoder: Base64Encoder,
  ) { }

  async executeDsMethod(authentication: Authentication, container: HTMLElement): Promise<void> {
    try {
      assert(authentication.dsMethodUrl, 'dsMethodUrl is required');
      assert(authentication.dsMethodCallbackUrl, 'dsMethodCallbackUrl is required');

      this.logger('DsMethodService: dsMethodUrl', authentication.dsMethodUrl);
      this.logger('DsMethodService: dsMethodCallbackUrl', authentication.dsMethodCallbackUrl);

      if (this.form?.hasAttribute('data-submitted')) {
        this.logger('DsMethodService: form already submitted – skipping');
        return;
      }

      const iframeName = v4();
      this.iFrame = this.createHiddenIFrame(iframeName);

      const formName = v4();
      this.form = this.createHiddenForm(authentication.dsMethodUrl, formName, iframeName);

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'threeDSMethodData';

      input.value = this.base64Encoder.encode({
        threeDSServerTransID: authentication.transactionId,
        threeDSMethodNotificationURL: authentication.dsMethodCallbackUrl,
      });

      this.form.appendChild(input);

      container.appendChild(this.form);
      container.appendChild(this.iFrame);

      const submitForm = new Promise<void>((resolve, reject) => {
        this.iFrame!.onload = () => resolve();
        this.iFrame!.onerror = () => reject(new Error('Failed to execute dsMethod'));

        this.form!.submit();
        this.form!.setAttribute('data-submitted', 'true');
      });

      await submitForm;
    } catch (error) {
      this.logger('DsMethodService: error', error);
      throw error;
    }
  }

  clean(): void {
    this.logger('DsMethodService: clean');
    try {
      this.iFrame?.remove();
      this.form?.remove();
      this.iFrame = undefined;
      this.form = undefined;
    } catch (error) {
      this.logger('DsMethodService: clean - error', error);
    }
  }

  private createHiddenIFrame(name: string): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    iframe.name = name;
    Object.assign(iframe.style, {
      visibility: 'hidden',
      display: 'none',
      position: 'absolute',
      top: '0',
      left: '0',
    });
    iframe.width = '0';
    iframe.height = '0';
    return iframe;
  }

  private createHiddenForm(action: string, name: string, target: string): HTMLFormElement {
    const form = document.createElement('form');
    form.name = name;
    form.target = target;
    form.action = action;
    form.method = 'POST';
    Object.assign(form.style, {
      visibility: 'hidden',
      display: 'none',
    });
    return form;
  }
}
