import { ApplicationRef, Component, ElementRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PreHydrationFormDirective } from './pre-hydration-form.directive';

/** A form as the server renders it, with the user's text already in the boxes. */
function typedForm(): { form: HTMLFormElement; name: HTMLInputElement; email: HTMLInputElement } {
  const form = document.createElement('form');
  form.innerHTML = '<input name="name"><input name="email" type="email"><button>Go</button>';
  document.body.append(form);
  const [name, email] = Array.from(form.querySelectorAll('input'));
  name.value = 'Ada';
  return { form, name, email };
}

function attach(form: HTMLFormElement, platform = 'browser'): void {
  TestBed.configureTestingModule({
    providers: [
      { provide: ElementRef, useValue: new ElementRef(form) },
      { provide: PLATFORM_ID, useValue: platform },
    ],
  });
  TestBed.runInInjectionContext(() => new PreHydrationFormDirective());
}

describe('PreHydrationFormDirective', () => {
  it('is a post form, so a submit before hydration never puts the fields in the URL', () => {
    @Component({
      imports: [PreHydrationFormDirective],
      template: '<form cvPreHydration></form>',
    })
    class Host {}
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form').getAttribute('method')).toBe('post');
  });

  afterEach(() => document.body.replaceChildren());

  it('puts text typed before hydration back and tells the control, after the first render', () => {
    const { form, name, email } = typedForm();
    const inputs: string[] = [];
    form.addEventListener('input', (e) => inputs.push((e.target as HTMLInputElement).name));
    attach(form);

    name.value = ''; // hydration writes the (empty) model value into the control
    TestBed.inject(ApplicationRef).tick();

    expect(name.value).toBe('Ada');
    expect(inputs).toEqual(['name']); // an `input` event, so Signal Forms and p-password take it as typed
    expect(email.value).toBe('');
  });

  it('leaves a control alone when hydration kept its text', () => {
    const { form, name } = typedForm();
    const inputs: Event[] = [];
    form.addEventListener('input', (e) => inputs.push(e));
    attach(form);

    TestBed.inject(ApplicationRef).tick();

    expect(name.value).toBe('Ada');
    expect(inputs).toEqual([]);
  });

  it('does nothing on the server', () => {
    const { form, name } = typedForm();
    attach(form, 'server');
    name.value = '';
    TestBed.inject(ApplicationRef).tick();
    expect(name.value).toBe('');
  });
});
