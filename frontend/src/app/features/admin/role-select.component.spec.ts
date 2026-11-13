import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { disabled, form, FormField, required } from '@angular/forms/signals';
import { Role } from '@core/models';
import { RoleSelectComponent } from './role-select.component';

@Component({
  imports: [RoleSelectComponent, FormField],
  template: `<cv-role-select label="Role for Ada" [formField]="f.role" />`,
})
class Host {
  readonly model = signal<{ role: Role }>({ role: 'USER' });
  readonly f = form(this.model);
}

@Component({
  imports: [RoleSelectComponent, FormField],
  template: `<cv-role-select label="Role for Ada" [formField]="f.role" />`,
})
class OffHost {
  readonly model = signal<{ role: Role }>({ role: 'ADMIN' });
  readonly f = form(this.model, (p) => disabled(p.role));
}

@Component({
  imports: [RoleSelectComponent, FormField],
  template: `<cv-role-select label="Role for Ada" [formField]="f.role" />`,
})
class RequiredHost {
  readonly model = signal<{ role: Role }>({ role: 'USER' });
  readonly f = form(this.model, (p) => required(p.role));
}

@Component({
  imports: [RoleSelectComponent],
  template: `<cv-role-select label="Role for Ada" [(value)]="role" />`,
})
class StandaloneHost {
  readonly role = signal<Role>('ADMIN');
}

async function render<T extends object>(host: new () => T) {
  const fixture = TestBed.createComponent(host);
  document.body.appendChild(fixture.nativeElement); // focus() needs the element in the document
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const combobox = () => el.querySelector<HTMLElement>('[role=combobox]')!;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const pick = async (name: string) => {
    combobox().click();
    await settle();
    const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role=option]')).find(
      (o) => o.textContent?.trim() === name,
    )!;
    option.click();
    await settle();
  };
  return { fixture, component: fixture.componentInstance, el, combobox, settle, pick };
}

describe('RoleSelectComponent', () => {
  // jsdom has no matchMedia, which the select's overlay asks for.
  beforeAll(() => {
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('shows the role of the field and names the control for a screen reader', async () => {
    const { combobox } = await render(Host);
    expect(combobox().textContent).toContain('User');
    expect(combobox().getAttribute('aria-label')).toBe('Role for Ada');
  });

  it('writes the picked role to the field, and follows the field when it changes', async () => {
    const { component, combobox, pick, settle } = await render(Host);
    await pick('Admin');
    expect(component.model().role).toBe('ADMIN');
    expect(combobox().textContent).toContain('Admin');

    component.model.set({ role: 'USER' });
    await settle();
    expect(combobox().textContent).toContain('User');
  });

  it('works without a form: [(value)]', async () => {
    const { component, combobox, pick } = await render(StandaloneHost);
    expect(combobox().textContent).toContain('Admin');
    await pick('User');
    expect(component.role()).toBe('USER');
  });

  it('gives the select the required state of the field (aria-required), as a bare p-select did', async () => {
    const { el, settle } = await render(RequiredHost);
    await settle();
    expect(el.querySelector('[role=combobox]')!.getAttribute('aria-required')).toBe('true');
  });

  it('is not marked required when the field is not', async () => {
    const { combobox } = await render(Host);
    expect(combobox().getAttribute('aria-required')).not.toBe('true');
  });

  it('marks the field touched on blur, and not before', async () => {
    const { component, combobox, settle } = await render(Host);
    expect(component.f.role().touched()).toBe(false);
    combobox().dispatchEvent(new Event('blur'));
    await settle();
    expect(component.f.role().touched()).toBe(true);
  });

  it('is disabled when the field is', async () => {
    const { combobox } = await render(OffHost);
    expect(combobox().getAttribute('aria-disabled')).toBe('true');
  });

  it('focuses the combobox when the field asks for focus', async () => {
    const { component, combobox } = await render(Host);
    component.f.role().focusBoundControl();
    expect(document.activeElement).toBe(combobox());
  });
});
