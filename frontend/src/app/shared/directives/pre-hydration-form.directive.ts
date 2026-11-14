import { afterNextRender, Directive, ElementRef, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * What a server-rendered form needs until the page hydrates (on a slow link, seconds):
 *
 * - It is a `post` form. Submitted before Angular takes over (Enter in a box), a browser sends the fields
 *   in the URL by default, and the URL carries the password into history and the proxy's logs. A POST
 *   keeps them in the body; after hydration Signal Forms handles the submit and this is not used.
 * - It keeps what the user typed. Signal Forms writes the model value (empty) into each control when it
 *   hydrates, which wiped the text. The directive notes the values when it is created (the boxes still hold
 *   the text then), and after the first render puts back what hydration cleared and fires `input`, so the
 *   form model and `p-password` take it as typed. A form created in the browser has nothing typed.
 */
@Directive({ selector: 'form[cvPreHydration]', host: { method: 'post' } })
export class PreHydrationFormDirective {
  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const form = inject<ElementRef<HTMLFormElement>>(ElementRef).nativeElement;
    const typed = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
    )
      .filter((control) => control.value !== '')
      .map((control) => ({ control, value: control.value }));
    if (!typed.length) return;

    afterNextRender(() => {
      for (const { control, value } of typed) {
        if (control.value === value) continue;
        control.value = value;
        control.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }
}
