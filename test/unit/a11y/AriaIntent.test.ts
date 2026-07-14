import { describe, it, expect } from 'vitest';
import { makeAriaIntent } from '../../../src/core/a11y/AriaIntent';

describe('makeAriaIntent — 값객체 조립 (헤드리스)', () => {
  it('role/labelFromDisplay 는 지정 시에만 키를 넣는다(exactOptionalPropertyTypes)', () => {
    const bare = makeAriaIntent({ 'aria-selected': 'true' });
    expect('role' in bare).toBe(false);
    expect('labelFromDisplay' in bare).toBe(false);
    expect(bare.attrs['aria-selected']).toBe('true');
  });

  it('opts 지정 시 role·labelFromDisplay 를 보존', () => {
    const it2 = makeAriaIntent({ 'aria-label': 'x' }, { role: 'gridcell', labelFromDisplay: true });
    expect(it2.role).toBe('gridcell');
    expect(it2.labelFromDisplay).toBe(true);
  });

  it('attrs 값 undefined 는 속성 제거 의미로 보존된다', () => {
    const intent = makeAriaIntent({ 'aria-sort': undefined });
    expect('aria-sort' in intent.attrs).toBe(true);
    expect(intent.attrs['aria-sort']).toBeUndefined();
  });
});
