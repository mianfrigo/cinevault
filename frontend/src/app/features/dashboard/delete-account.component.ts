import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { form, FormField, FormRoot, maxLength, required, validate } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthStore } from '../../core/auth/auth.store';
import { ApiError } from '../../core/models';
import { failureMessage } from '../auth/auth.api';
import { AuthFieldComponent } from '../auth/auth-field.component';
import { focusFirstInvalid } from '../auth/auth-focus';
import { PASSWORD_MAX } from '../auth/auth.rules';
import { AccountApi } from './account.api';
import { AccountSectionComponent, FormNoteComponent, Note } from './account-section.component';

const CONFIRM_WORD = 'DELETE';
const LAST_ADMIN =
  'You are the last admin, so this account cannot be deleted. Make another user an admin first.';

/**
 * The "Delete account" block: a button that opens a dialog. The destructive button is enabled only
 * once DELETE is typed and a password is entered. Focus goes to the first field on open and back to
 * the trigger on close; Escape closes (PrimeNG's dialog traps focus and handles the key).
 */
@Component({
  selector: 'cv-delete-account',
  imports: [
    FormField,
    FormRoot,
    ButtonModule,
    DialogModule,
    InputTextModule,
    PasswordModule,
    AuthFieldComponent,
    AccountSectionComponent,
    FormNoteComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <cv-account-section
      heading="Delete account"
      headingId="h-delete"
      description="Removes your account and your favorites for good. This cannot be undone."
    >
      <div>
        <p-button
          #trigger
          label="Delete my account"
          severity="danger"
          variant="outlined"
          (onClick)="open()"
        />
      </div>
    </cv-account-section>

    <p-dialog
      header="Delete your account?"
      [(visible)]="visible"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [closable]="!deleteForm().submitting()"
      [closeOnEscape]="!deleteForm().submitting()"
      [focusOnShow]="false"
      [style]="{ width: '28rem', maxWidth: '92vw' }"
      (onShow)="focusFirstField()"
      (onHide)="onHide()"
    >
      <form id="delete-form" [formRoot]="deleteForm" class="grid gap-4">
        <cv-form-note [note]="note()" />
        <p class="text-sm text-fg-2">
          This deletes your sign-in and your saved favorites. To confirm, type
          <b class="font-medium text-fg">{{ word }}</b> and enter your password.
        </p>
        <cv-auth-field
          label="Type DELETE to confirm"
          controlId="delete-confirm"
          [field]="deleteForm.confirm"
        >
          <input
            pInputText
            id="delete-confirm"
            autocomplete="off"
            spellcheck="false"
            class="w-full"
            [formField]="deleteForm.confirm"
          />
        </cv-auth-field>
        <cv-auth-field label="Password" controlId="delete-password" [field]="deleteForm.password">
          <p-password
            inputId="delete-password"
            autocomplete="current-password"
            [feedback]="false"
            [toggleMask]="true"
            [fluid]="true"
            [formField]="deleteForm.password"
          />
        </cv-auth-field>
        <div class="flex flex-wrap justify-end gap-2">
          <p-button
            type="button"
            label="Keep my account"
            severity="secondary"
            variant="outlined"
            [disabled]="deleteForm().submitting()"
            (onClick)="visible.set(false)"
          />
          <p-button
            type="submit"
            label="Delete account"
            severity="danger"
            [disabled]="deleteForm().invalid()"
            [loading]="deleteForm().submitting()"
          />
        </div>
      </form>
    </p-dialog>
  `,
})
export class DeleteAccountComponent {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(AccountApi);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly trigger = viewChild.required('trigger', { read: ElementRef });

  protected readonly word = CONFIRM_WORD;
  protected readonly visible = signal(false);
  protected readonly note = signal<Note | null>(null);

  private readonly model = signal({ confirm: '', password: '' });
  protected readonly deleteForm = form(
    this.model,
    (path) => {
      validate(path.confirm, ({ value }) =>
        value().trim() === CONFIRM_WORD
          ? undefined
          : { kind: 'confirm', message: `Type ${CONFIRM_WORD} to confirm.` },
      );
      required(path.password, { message: 'Enter your password.' });
      maxLength(path.password, PASSWORD_MAX, {
        message: `Use ${PASSWORD_MAX} characters or fewer.`,
      });
    },
    {
      submission: {
        onInvalid: focusFirstInvalid,
        action: async (f) => {
          this.note.set(null);
          try {
            await this.api.deleteAccount(f.password().value());
          } catch (e) {
            const error = e as ApiError;
            if (error.code === 'PASSWORD_WRONG') {
              afterNextRender(() => focusFirstInvalid(f), { injector: this.injector });
              return [
                { kind: 'server', message: 'That password is not correct.', fieldTree: f.password },
              ];
            }
            this.note.set({
              kind: 'error',
              text: error.code === 'LAST_ADMIN' ? LAST_ADMIN : failureMessage(error),
            });
            return;
          }
          await this.auth.logout();
          await this.router.navigateByUrl('/');
          return;
        },
      },
    },
  );

  protected open(): void {
    this.visible.set(true);
  }

  protected focusFirstField(): void {
    this.document.getElementById('delete-confirm')?.focus();
  }

  /** Closed by a button, Escape or success: clear what was typed and give focus back to the button that opened it. */
  protected onHide(): void {
    this.model.set({ confirm: '', password: '' });
    this.deleteForm().reset();
    this.note.set(null);
    this.trigger().nativeElement.querySelector('button')?.focus();
  }
}
