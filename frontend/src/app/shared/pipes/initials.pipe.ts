import { Pipe, PipeTransform } from '@angular/core';
import { initials } from '@shared/utils/initials';

/** `name | initials` -> "KR"; `name | initials: 'A'` uses the fallback for a name without letters. */
@Pipe({ name: 'initials' })
export class InitialsPipe implements PipeTransform {
  transform(name: string, fallback = ''): string {
    return initials(name, fallback);
  }
}
