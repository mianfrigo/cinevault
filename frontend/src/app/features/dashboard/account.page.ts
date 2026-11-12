import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  Injector,
  linkedSignal,
  signal,
} from '@angular/core';
import {
  apply,
  form,
  FormField,
  FormRoot,
  maxLength,
  required,
  type FieldTree,
} from '@angular/forms/signals';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthStore } from '../../core/auth/auth.store';
import { ApiError } from '../../core/models';
import { failureMessage } from '../auth/auth.api';
import { AuthFieldComponent } from '../auth/auth-field.component';
import { focusFirstInvalid } from '../auth/auth-focus';
import {
  confirmMatches,
  emailRules,
  nameRules,
  newPasswordRules,
  PASSWORD_MAX,
} from '../auth/auth.rules';
import { AccountApi } from './account.api';
import { AccountSectionComponent, FormNoteComponent, Note } from './account-section.component';
import { DeleteAccountComponent } from './delete-account.component';

/** Neutral copy for a wrong password, shown under the field. */
export const PASSWORD_WRONG = 'That password is not correct.';

/** /dashboard/account: name, password, email and the delete-account flow. Every form uses Signal Forms. */
@Component({
  selector: 'cv-account-page',
  imports: [
    FormField,
    FormRoot,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    AuthFieldComponent,
    AccountSectionComponent,
    FormNoteComponent,
    DeleteAccountComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6 md:mb-8">
      <h1 class="text-h1 text-fg">Account</h1>
      <p class="mt-2 text-sm text-fg-3">Your details and sign-in settings.</p>
    </header>

    <cv-account-section
      heading="Profile"
      headingId="h-profile"
      description="Your name is shown on your account."
    >
      <cv-form-note [note]="profileNote()" />
      <form id="profile-form" [formRoot]="profileForm" class="grid gap-4">
        <cv-auth-field label="Name" controlId="name" [field]="profileForm.name">
          <input
            pInputText
            id="name"
            autocomplete="name"
            class="w-full"
            [formField]="profileForm.name"
          />
        </cv-auth-field>
        <div>
          <p-button type="submit" label="Save changes" [loading]="profileForm().submitting()" />
        </div>
      </form>
    </cv-account-section>

    <cv-account-section
      heading="Password"
      headingId="h-password"
      description="Enter your current password to set a new one. You will be logged out and log in again."
    >
      <cv-form-note [note]="passwordNote()" />
      <form id="password-form" [formRoot]="passwordForm" class="grid gap-4">
        <cv-auth-field
          label="Current password"
          controlId="old-password"
          [field]="passwordForm.oldPassword"
        >
          <p-password
            inputId="old-password"
            autocomplete="current-password"
            [feedback]="false"
            [toggleMask]="true"
            [fluid]="true"
            [formField]="passwordForm.oldPassword"
          />
        </cv-auth-field>
        <cv-auth-field
          label="New password"
          controlId="new-password"
          hint="At least 10 characters."
          [field]="passwordForm.newPassword"
        >
          <p-password
            inputId="new-password"
            autocomplete="new-password"
            [feedback]="false"
            [toggleMask]="true"
            [fluid]="true"
            [formField]="passwordForm.newPassword"
          />
        </cv-auth-field>
        <cv-auth-field
          label="Confirm new password"
          controlId="confirm-password"
          [field]="passwordForm.confirm"
        >
          <p-password
            inputId="confirm-password"
            autocomplete="new-password"
            [feedback]="false"
            [toggleMask]="true"
            [fluid]="true"
            [formField]="passwordForm.confirm"
          />
        </cv-auth-field>
        <div>
          <p-button type="submit" label="Update password" [loading]="passwordForm().submitting()" />
        </div>
      </form>
    </cv-account-section>

    <cv-account-section
      heading="Email"
      headingId="h-email"
      description="We send a verification link to the new address. Your email changes only after you open it."
    >
      @if (auth.user(); as user) {
        <p class="text-sm text-fg-2">
          Current email: <b class="font-medium text-fg">{{ user.email }}</b>
        </p>
      }
      <cv-form-note [note]="emailNote()" />
      <form id="email-form" [formRoot]="emailForm" class="grid gap-4">
        <cv-auth-field label="New email" controlId="new-email" [field]="emailForm.newEmail">
          <input
            pInputText
            id="new-email"
            type="email"
            autocomplete="email"
            class="w-full"
            [formField]="emailForm.newEmail"
          />
        </cv-auth-field>
        <cv-auth-field
          label="Current password"
          controlId="email-password"
          [field]="emailForm.password"
        >
          <p-password
            inputId="email-password"
            autocomplete="current-password"
            [feedback]="false"
            [toggleMask]="true"
            [fluid]="true"
            [formField]="emailForm.password"
          />
        </cv-auth-field>
        <div>
          <p-button type="submit" label="Change email" [loading]="emailForm().submitting()" />
        </div>
      </form>
    </cv-account-section>

    <cv-delete-account />
  `,
})
export default class AccountPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(AccountApi);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  protected readonly profileNote = signal<Note | null>(null);
  protected readonly passwordNote = signal<Note | null>(null);
  protected readonly emailNote = signal<Note | null>(null);

  /**
   * A server error on one field (shown inline under it). Focus follows once it is drawn, because
   * `onInvalid` only runs for client-side errors.
   */
  private fieldError(root: FieldTree<unknown>, field: FieldTree<string>, message: string) {
    afterNextRender(() => focusFirstInvalid(root), { injector: this.injector });
    return [{ kind: 'server', message, fieldTree: field }];
  }

  // The server renders no user, so the field starts empty and fills in once the session is restored.
  private readonly profileModel = linkedSignal(() => ({ name: this.auth.user()?.name ?? '' }));
  protected readonly profileForm = form(this.profileModel, (path) => apply(path.name, nameRules), {
    submission: {
      onInvalid: focusFirstInvalid,
      action: async (f) => {
        this.profileNote.set(null);
        try {
          this.auth.setUser(await this.api.updateName(f.name().value().trim()));
          this.profileNote.set({ kind: 'success', text: 'Name saved.' });
        } catch (e) {
          this.profileNote.set({ kind: 'error', text: failureMessage(e as ApiError) });
        }
      },
    },
  });

  private readonly passwordModel = signal({ oldPassword: '', newPassword: '', confirm: '' });
  protected readonly passwordForm = form(
    this.passwordModel,
    (path) => {
      required(path.oldPassword, { message: 'Enter your current password.' });
      maxLength(path.oldPassword, PASSWORD_MAX, {
        message: `Use ${PASSWORD_MAX} characters or fewer.`,
      });
      apply(path.newPassword, newPasswordRules);
      required(path.confirm, { message: 'Confirm your new password.' });
      confirmMatches(path.confirm, path.newPassword);
    },
    {
      submission: {
        onInvalid: focusFirstInvalid,
        action: async (f) => {
          this.passwordNote.set(null);
          const { oldPassword, newPassword } = f().value();
          try {
            await this.api.changePassword(oldPassword, newPassword);
          } catch (e) {
            const error = e as ApiError;
            if (error.code === 'OLD_PASSWORD_WRONG') {
              return this.fieldError(f, f.oldPassword, 'Your current password is not correct.');
            }
            this.passwordNote.set({ kind: 'error', text: failureMessage(error) });
            return;
          }
          // The API revoked every session: this one ends too.
          await this.auth.logout();
          await this.router.navigate(['/login'], { queryParams: { notice: 'password-changed' } });
          return;
        },
      },
    },
  );

  private readonly emailModel = signal({ newEmail: '', password: '' });
  protected readonly emailForm = form(
    this.emailModel,
    (path) => {
      apply(path.newEmail, emailRules);
      required(path.password, { message: 'Enter your current password.' });
      maxLength(path.password, PASSWORD_MAX, {
        message: `Use ${PASSWORD_MAX} characters or fewer.`,
      });
    },
    {
      submission: {
        onInvalid: focusFirstInvalid,
        action: async (f) => {
          this.emailNote.set(null);
          const newEmail = f.newEmail().value().trim();
          try {
            await this.api.changeEmail(newEmail, f.password().value());
          } catch (e) {
            const error = e as ApiError;
            if (error.code === 'PASSWORD_WRONG') {
              return this.fieldError(f, f.password, PASSWORD_WRONG);
            }
            this.emailNote.set({ kind: 'error', text: failureMessage(error) });
            return;
          }
          this.emailModel.set({ newEmail: '', password: '' });
          f().reset();
          this.emailNote.set({
            kind: 'success',
            text: `We sent a verification link to ${newEmail}. Your email changes after you open it.`,
          });
          return;
        },
      },
    },
  );
}
