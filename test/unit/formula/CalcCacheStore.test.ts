// ============================================================
// DD-08 §2.7 — CalcCacheStore 유닛테스트
// 못박는 계약: value-hash(참조 아닌 값)·LRU 축출(유계)·정밀 무효화·직렬화 round-trip·
//   import 시 해시 재검증(스테일 거부, REQ-T8-845/846/T5-049).
// ============================================================
import { describe, it, expect } from 'vitest';
import { LruCalcCacheStore, hashInputs } from '../../../src/core/formula/CalcCacheStore.js';
import { OGDecimal } from '../../../src/core/OGDecimal.js';
import type { EvalOutcome } from '../../../src/core/formula/FormulaEvaluator.js';

function outcome(v: number): EvalOutcome {
  return { value: OGDecimal.from(v), error: null, approx: false, touched: new Set() };
}

describe('hashInputs — 값 기준 구조해시(§2.7, REQ-T8-845)', () => {
  it('참조가 달라도 값이 같으면 해시 동일', () => {
    const h1 = hashInputs([OGDecimal.from('1.50'), 'x', true, null]);
    const h2 = hashInputs([OGDecimal.from('1.5'), 'x', true, null]);
    expect(h1).toBe(h2); // 1.50 == 1.5 (정규 10진 문자열)
  });

  it('값이 다르면 해시 다름(변경 감지 누락 0)', () => {
    expect(hashInputs([OGDecimal.from('1')])).not.toBe(hashInputs([OGDecimal.from('2')]));
    expect(hashInputs(['a'])).not.toBe(hashInputs(['b']));
    expect(hashInputs([null])).not.toBe(hashInputs(['']));
  });
});

describe('LruCalcCacheStore — LRU/무효화/직렬화(§2.7)', () => {
  it('get/set 왕복 + inputsHash 보존', () => {
    const c = new LruCalcCacheStore(10);
    c.set('r1:t', outcome(3), 'h1');
    const e = c.get('r1:t');
    expect(e?.inputsHash).toBe('h1');
    expect((e?.outcome.value as OGDecimal).toString()).toBe('3');
    expect(c.size).toBe(1);
  });

  it('상한 초과 시 가장 오래된 키 축출(유계·단조증가 금지)', () => {
    const c = new LruCalcCacheStore(2);
    c.set('a', outcome(1), 'h');
    c.set('b', outcome(2), 'h');
    c.set('c', outcome(3), 'h'); // a 축출
    expect(c.size).toBe(2);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBeDefined();
    expect(c.get('c')).toBeDefined();
  });

  it('get 은 LRU 최신화(최근 사용은 살아남음)', () => {
    const c = new LruCalcCacheStore(2);
    c.set('a', outcome(1), 'h');
    c.set('b', outcome(2), 'h');
    c.get('a');                  // a 를 최근 사용으로 승격
    c.set('c', outcome(3), 'h'); // 이번엔 b 가 가장 오래됨 → 축출
    expect(c.get('a')).toBeDefined();
    expect(c.get('b')).toBeUndefined();
  });

  it('invalidate 는 지정 키만 정밀 제거', () => {
    const c = new LruCalcCacheStore(10);
    c.set('a', outcome(1), 'h'); c.set('b', outcome(2), 'h');
    c.invalidate(['a']);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBeDefined();
  });

  it('export/import round-trip — verify 통과분만 신뢰', () => {
    const c = new LruCalcCacheStore(10);
    c.set('a', outcome(1), 'hA'); c.set('b', outcome(2), 'hB');
    const snap = c.export();
    expect(snap.version).toBe(1);
    expect(snap.entries.length).toBe(2);

    const c2 = new LruCalcCacheStore(10);
    // a 만 현재 해시 일치, b 는 스테일 → 거부.
    c2.import(snap, (key, h) => key === 'a' && h === 'hA');
    expect(c2.get('a')?.inputsHash).toBe('hA');
    expect((c2.get('a')?.outcome.value as OGDecimal).toString()).toBe('1');
    expect(c2.get('b')).toBeUndefined();
  });

  it('미지 버전 스냅샷은 skip(하위호환)', () => {
    const c = new LruCalcCacheStore(10);
    c.import({ version: 99 as unknown as 1, entries: [] }, () => true);
    expect(c.size).toBe(0);
  });
});
