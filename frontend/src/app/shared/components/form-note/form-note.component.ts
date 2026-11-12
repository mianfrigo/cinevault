import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MessageModule } from 'primeng/message';
import { FocusOnDirective } from '@shared/directives/focus-on.directive';

/** Result of a form submit as text under its heading. An error takes keyboard focus; a success is announced politely. */
export interface Note {
  kind: 'error' | 'success';
  text: string;
}

/** The banner of a form: renders nothing without a note. */
@Component({
  selector: 'cv-form-note',
  imports: [MessageModule, FocusOnDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (note(); as n) {
      @if (n.kind === 'error') {
        <p-message severity="error" role="alert" [cvFocusOn]="n">{{ n.text }}</p-message>
      } @else {
        <p-message severity="success" role="status">{{ n.text }}</p-message>
      }
    }
  `,
})
export class FormNoteComponent {
  readonly note = input<Note | null>(null);
}
