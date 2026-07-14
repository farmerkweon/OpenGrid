// DD-11 §2.4·§2.4b·§2.5·§5 — 스냅샷 브리지(무효화)·전파 provider·읽기 포트·토큰 카탈로그
import { describe, it, expect, vi } from 'vitest';
import {
  AppearanceSnapshotBridge,
  snapshotFromComputedStyle,
  AppearanceProvider,
  AppearanceComposer,
  Appearance,
  defaultAppearanceRegistrySet,
  staticAppearanceView,
  cfPortFrom,
  DEFAULT_SEMANTIC_INK,
  TOKEN_CATALOG,
  SEMANTIC_ALIASES,
  tokensByAxis,
  catalogEntry,
  type ResolvedAppearanceSnapshot,
} from '../../../src/core/appearance/index.js';

function snap(overrides?: Partial<ResolvedAppearanceSnapshot>): ResolvedAppearanceSnapshot {
  return {
    ink: '#000', surface: '#fff', line: '#e0e0e0', accent: '#1976d2',
    gridLine: '#e0e0e0', overlayScrim: '#f5f5f5', shadowInk: '0 0 0',
    seriesColors: ['#1976d2', '#388e3c'],
    font: { family: 'sans-serif', size: 13, lineHeight: 1.4 },
    key: { appearance: new Appearance(), locale: 'ko' },
    ...overrides,
  };
}

describe('DD-11 §2.4 AppearanceSnapshotBridge — 1회 해소 캐시 + 무효화', () => {
  it('get() 은 resolve 를 1회만 호출 후 캐시', () => {
    const resolve = vi.fn(() => snap());
    const bridge = new AppearanceSnapshotBridge(resolve);
    bridge.get();
    bridge.get();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(bridge.isValid).toBe(true);
  });

  it('invalidate() 후 다음 get() 이 재해소(낡은 색 0)', () => {
    const resolve = vi.fn(() => snap());
    const bridge = new AppearanceSnapshotBridge(resolve);
    bridge.get();
    bridge.invalidate();
    expect(bridge.isValid).toBe(false);
    bridge.get();
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('snapshotFromComputedStyle — 헤드리스(no window) 폴백 never-throw', () => {
    const s = snapshotFromComputedStyle(null, { appearance: new Appearance(), locale: 'ko', seriesColors: ['#f00'] });
    expect(s.seriesColors).toEqual(['#f00']);
    expect(s.font.size).toBe(13);
    expect(s.key.locale).toBe('ko');
  });
});

describe('DD-11 §2.5 AppearanceProvider — 발행-구독 + 스냅샷 무효화 단일 채널', () => {
  it('publish 시 bridge.invalidate() + 전 구독자 통지', () => {
    const resolve = vi.fn(() => snap());
    const bridge = new AppearanceSnapshotBridge(resolve);
    bridge.get(); // 캐시 채움
    const provider = new AppearanceProvider(bridge);
    const composer = new AppearanceComposer(defaultAppearanceRegistrySet());
    const listener = vi.fn();
    const off = provider.subscribe(listener);
    expect(provider.subscriberCount).toBe(1);

    const composed = composer.compose(new Appearance('dark'));
    provider.publish(composed);

    expect(bridge.isValid).toBe(false); // 무효화됨
    expect(listener).toHaveBeenCalledWith(composed);
    expect(provider.last).toBe(composed);

    off();
    expect(provider.subscriberCount).toBe(0);
  });

  it('구독 해지 후 통지 안 됨', () => {
    const provider = new AppearanceProvider();
    const listener = vi.fn();
    provider.subscribe(listener)();
    const composed = new AppearanceComposer(defaultAppearanceRegistrySet()).compose(new Appearance());
    provider.publish(composed);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('DD-11 §2.4b AppearanceView — 읽기 포트 + 데이터색↔의미색 분리 + CF 어댑터', () => {
  const view = staticAppearanceView({
    appearance: new Appearance('ocean'),
    snapshot: snap(),
    ramps: { primary: ['#1976d2', '#42a5f5'], graphite: ['#3a3f45', '#6b7178'] },
  });

  it('rampFrom(데이터색) ≠ semanticInk(의미색) — 컨텍스트 분리', () => {
    expect(view.rampFrom('primary')[0]).toBe('#1976d2');
    expect(view.semanticInk('error')).toBe(DEFAULT_SEMANTIC_INK.error);
    // 의미 빨강은 데이터 램프에 없다(재사용 금지 강제)
    expect(view.rampFrom('primary')).not.toContain(view.semanticInk('error'));
  });

  it('snapshot() 은 주입 스냅샷 반환', () => {
    expect(view.snapshot().accent).toBe('#1976d2');
  });

  it('cfPortFrom — DD-05 CF 좁은 포트(rampFrom(seed):string) 어댑터', () => {
    const cf = cfPortFrom(view);
    expect(cf.rampFrom('primary')).toBe('#1976d2'); // 램프 대표색(첫 항목)
    expect(cf.rampFrom('graphite')).toBe('#3a3f45');
  });

  it('cfPortFrom — 빈 램프면 안전 폴백', () => {
    const empty = staticAppearanceView({ appearance: new Appearance(), snapshot: snap() });
    const cf = cfPortFrom(empty);
    expect(cf.rampFrom('primary')).toBe('#1976d2');
    expect(cf.rampFrom('graphite')).toBe('#3a3f45');
  });
});

describe('DD-11 §5·§9.1 tokenCatalog — 이름공간이 소유 축을 강제(직교 증거)', () => {
  it('모든 항목은 axis 를 가진다(이름만 보고 축을 안다)', () => {
    for (const e of TOKEN_CATALOG) {
      expect(['theme', 'skin', 'density', 'texture', 'icon']).toContain(e.axis);
      expect(e.name.startsWith('--og-')).toBe(true);
    }
  });

  it('밀도/질감 토큰은 각자 축 소유(교차 없음)', () => {
    expect(tokensByAxis('density').every((e) => e.name.startsWith('--og-density') || e.name === '--og-font-size')).toBe(true);
    expect(tokensByAxis('texture').every((e) => e.name.startsWith('--og-texture'))).toBe(true);
  });

  it('semantic alias 는 구 토큰을 보존 매핑(회귀 0)', () => {
    expect(SEMANTIC_ALIASES.length).toBeGreaterThan(0);
    for (const a of SEMANTIC_ALIASES) expect(a.aliasOf).toBeDefined();
    expect(catalogEntry('--og-accent')?.aliasOf).toBe('--og-primary');
  });

  it('상태 의미색은 semantic 컨텍스트(데이터색과 분리)', () => {
    expect(catalogEntry('--og-status-error')?.context).toBe('semantic');
  });
});
