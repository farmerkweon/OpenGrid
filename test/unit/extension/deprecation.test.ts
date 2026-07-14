// DD-10 §2.8 — DeprecationManager: 경고 dedup·매니페스트·removeIn 게이트(UC-7).
import { describe, it, expect, vi } from 'vitest';
import { DeprecationManager } from '../../../src/core/extension/DeprecationManager';

describe('DeprecationManager', () => {
  it('경고 dedup: 동일 id 반복 호출은 1회만 방출', () => {
    const sink = vi.fn();
    const dm = new DeprecationManager(sink);
    const info = { since: '2.1', removeIn: '3.0', replacement: 'registerSkin' };
    dm.warn('defineSkin', info);
    dm.warn('defineSkin', info);
    dm.warn('defineSkin', info);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toContain('[OpenGrid]');
    expect(sink.mock.calls[0][0]).toContain('registerSkin');
  });

  it('manifest: 기계판독 폐기 레코드 산출(옵션 필드 보존)', () => {
    const dm = new DeprecationManager(() => {});
    dm.warn('a', { since: '2.1', removeIn: '3.0', replacement: 'b', note: 'use b' });
    dm.warn('c', { since: '2.2', removeIn: '3.0' });
    const m = dm.manifest();
    expect(m).toHaveLength(2);
    const a = m.find((r) => r.id === 'a')!;
    expect(a.replacement).toBe('b');
    expect(a.note).toBe('use b');
    const c = m.find((r) => r.id === 'c')!;
    expect(c.replacement).toBeUndefined();
  });

  it('gateRemoval: removeIn 이전 제거 차단(blocked), 이후 ok', () => {
    const dm = new DeprecationManager(() => {});
    dm.warn('defineSkin', { since: '2.1', removeIn: '3.0' });
    expect(dm.gateRemoval('defineSkin', '2.9')).toBe('blocked');
    expect(dm.gateRemoval('defineSkin', '3.0')).toBe('ok');
    expect(dm.gateRemoval('defineSkin', '3.1')).toBe('ok');
    expect(dm.gateRemoval('unknown', '1.0')).toBe('ok'); // 미등록은 무제약
  });
});
