import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { disabled, form, FormField, required } from '@angular/forms/signals';
import { Password } from 'primeng/password';
import { PasswordInputComponent } from './password-input.component';

@Component({
  imports: [PasswordInputComponent, FormField],
  template: `<cv-password-input
    inputId="pw"
    autocomplete="new-password"
    [formField]="f.password"
  />`,
})
class Host {
  readonly model = signal({ password: 'secret' });
  readonly f = form(this.model, (p) => required(p.password));
}

@Component({
  imports: [PasswordInputComponent, FormField],
  template: `<cv-password-input inputId="pw" [formField]="f.password" />`,
})
class OffHost {
  readonly model = signal({ password: 'secret' });
  readonly f = form(this.model, (p) => disabled(p.password));
}

@Component({
  imports: [PasswordInputComponent],
  template: `<cv-password-input inputId="alone" [(value)]="text" />`,
})
class StandaloneHost {
  readonly text = signal('abc');
}

async function render<T extends object>(host: new () => T) {
  const fixture = TestBed.createComponent(host);
  document.body.appendChild(fixture.nativeElement); // focus() needs the element in the document
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const input = () => el.querySelector<HTMLInputElement>('input')!;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, component: fixture.componentInstance, el, input, settle };
}

describe('PasswordInputComponent', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows the field value and writes what is typed back to the field', async () => {
    const { fixture, component, input, settle } = await render(Host);
    expect(input().value).toBe('secret');

    input().value = 'changed';
    input().dispatchEvent(new Event('input'));
    await settle();
    expect(component.model().password).toBe('changed');

    // The other way: the control (and the PrimeNG field in it) follows the model. jsdom does not repaint
    // the native input after such a write (a bare p-password does not either), so read the state.
    component.model.set({ password: 'from the model' });
    await settle();
    const control = fixture.debugElement.query(By.directive(PasswordInputComponent));
    expect(control.componentInstance.value()).toBe('from the model');
    expect(fixture.debugElement.query(By.directive(Password)).componentInstance.modelValue()).toBe(
      'from the model',
    );
  });

  it('works without a form: [(value)]', async () => {
    const { component, input, settle } = await render(StandaloneHost);
    expect(input().value).toBe('abc');
    input().value = 'xyz';
    input().dispatchEvent(new Event('input'));
    await settle();
    expect(component.text()).toBe('xyz');
  });

  it('passes inputId and autocomplete to the native input', async () => {
    const { input } = await render(Host);
    expect(input().id).toBe('pw');
    expect(input().getAttribute('autocomplete')).toBe('new-password');
  });

  it('has the toggle: the mask hides the text, the toggle shows it', async () => {
    const { el, input, settle } = await render(Host);
    expect(input().type).toBe('password');
    el.querySelector('.p-password-unmask-icon')!.dispatchEvent(new MouseEvent('click'));
    await settle();
    expect(input().type).toBe('text');
    el.querySelector('.p-password-mask-icon')!.dispatchEvent(new MouseEvent('click'));
    await settle();
    expect(input().type).toBe('password');
    // no strength meter
    expect(document.querySelector('.p-password-overlay')).toBeNull();
  });

  it('marks the field touched on blur, and not before', async () => {
    const { component, input, settle } = await render(Host);
    expect(component.f.password().touched()).toBe(false);
    input().dispatchEvent(new Event('focus'));
    await settle();
    expect(component.f.password().touched()).toBe(false);
    input().dispatchEvent(new Event('blur'));
    await settle();
    expect(component.f.password().touched()).toBe(true);
  });

  it('shows the raw invalid state on the input, like PrimeNG always got it', async () => {
    const { component, input, settle } = await render(Host);
    expect(input().classList.contains('p-invalid')).toBe(false);
    component.model.set({ password: '' });
    await settle();
    expect(component.f.password().invalid()).toBe(true);
    expect(input().classList.contains('p-invalid')).toBe(true);
  });

  it('is disabled when the field is', async () => {
    const { input } = await render(OffHost);
    expect(input().disabled).toBe(true);
  });

  it('focuses the native input when the field asks for focus (focusFirstInvalid)', async () => {
    const { component, input } = await render(Host);
    component.f.password().focusBoundControl();
    expect(document.activeElement).toBe(input());
  });
});
