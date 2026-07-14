import { describe, it, expect, vi } from 'vitest';
import { VisualEquivRegistry } from '../../../src/core/a11y/VisualEquivRegistry';
import type { VisualEquivProvider } from '../../../src/core/a11y/VisualEquivRegistry';

const provider = (kind: string, fn: (m: any) => string): VisualEquivProvider => ({ kind, describe: fn });

describe('VisualEquivRegistry — 텍스트 등가 게이트 (REQ-T9-825)', () => {
  it('provider 등록 후 describe 로 낭독 텍스트를 산출', () => {
    const reg = new VisualEquivRegistry();
    reg.register(provider('chart', (m) => `차트: 카테고리 ${m.n}개`));
    expect(reg.has('chart')).toBe(true);
    expect(reg.describe('chart', { n: 3 })).toBe('차트: 카테고리 3개');
    expect(reg.list()).toContain('chart');
  });

  it('미등록 종류 describe 는 빈 문자열 + 경고 발화(never-throw, 침묵 금지·게이트 신호)', () => {
    const warn = vi.fn();
    const reg = new VisualEquivRegistry(warn);
    expect(reg.has('sparkline')).toBe(false); // CI 게이트 근거. / CI-gate basis.
    expect(reg.describe('sparkline', {})).toBe('');
    expect(warn).toHaveBeenCalledTimes(1); // 독스트링 계약: 미등록 낭독 시도 = 경고(DD-11 디자인체크 권고).
    expect(warn.mock.calls[0]![0]).toContain('sparkline');
  });

  it('내장(builtin) provider 는 override 없이 덮이지 않는다(코어 보호)', () => {
    const warn = vi.fn();
    const reg = new VisualEquivRegistry(warn);
    reg.register(provider('databar', () => 'builtin'), { origin: 'builtin' });
    const r = reg.register(provider('databar', () => 'user'));
    expect(r.ok).toBe(false);
    expect(r.action).toBe('kept');
    expect(reg.describe('databar', {})).toBe('builtin');
  });

  it('override:true 로는 교체 가능', () => {
    const reg = new VisualEquivRegistry();
    reg.register(provider('delta', () => 'a'), { origin: 'builtin' });
    const r = reg.register(provider('delta', () => 'b'), { override: true });
    expect(r.ok).toBe(true);
    expect(reg.describe('delta', {})).toBe('b');
  });

  it('disposePlugin 은 pluginId 단위로 일괄 해제', () => {
    const reg = new VisualEquivRegistry();
    reg.register(provider('iconset', () => 'x'), { pluginId: 'p1' });
    expect(reg.disposePlugin('p1')).toBe(1);
    expect(reg.has('iconset')).toBe(false);
  });
});
