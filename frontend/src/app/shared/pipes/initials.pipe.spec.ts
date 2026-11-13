import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { InitialsPipe } from './initials.pipe';

@Component({
  imports: [InitialsPipe],
  template: `<i id="a">{{ 'Keanu Reeves' | initials }}</i
    ><i id="b">{{ '' | initials: 'A' }}</i
    ><i id="c">{{ 'Cher' | initials }}</i>`,
})
class Host {}

describe('InitialsPipe', () => {
  const pipe = new InitialsPipe();

  it('takes the first letter of the first and last word, upper case', () => {
    expect(pipe.transform('keanu charles reeves')).toBe('KR');
    expect(pipe.transform('Cher')).toBe('C');
  });

  it('returns the fallback (empty by default) for a name without letters', () => {
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform('  ', 'A')).toBe('A');
  });

  it('works in a template, with and without the fallback', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const text = (id: string) => fixture.nativeElement.querySelector('#' + id).textContent;
    expect(text('a')).toBe('KR');
    expect(text('b')).toBe('A');
    expect(text('c')).toBe('C');
  });
});
