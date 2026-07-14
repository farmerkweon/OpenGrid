// DD-10 §2.6 — 재사용 계약 테스트 키트: 빌트인·서드파티가 동일 키트로 자가검증(REQ-T8-825).
import { describe, it, expect } from 'vitest';
import {
  baseExtensionChecks,
  runConformance,
  conformancePassed,
  registryConformanceKit,
} from '../../../src/core/extension/conformance';
import { TypedRegistry } from '../../../src/core/extension/Registry';
import type { IExtension } from '../../../src/core/extension/IExtension';

describe('baseExtensionChecks: IExtension 공통 수명 계약', () => {
  const kit = { spi: 'IExtension@1', checks: baseExtensionChecks<IExtension>() };

  it('적합 구현은 전 검사 통과', () => {
    const good: () => IExtension = () => ({ spi: 'IGood@1', activate() {}, dispose() {} });
    const results = runConformance(kit, good);
    expect(conformancePassed(results)).toBe(true);
  });

  it('spi 태그 누락 구현은 shape 위반', () => {
    const bad: () => IExtension = () => ({ spi: '' });
    const results = runConformance(kit, bad);
    expect(conformancePassed(results)).toBe(false);
    const shape = results.find((r) => r.id === 'shape')!;
    expect(shape.violations.length).toBeGreaterThan(0);
  });

  it('lifecycle: activate/dispose 대칭이 throw 하면 위반 보고', () => {
    const throwing: () => IExtension = () => ({
      spi: 'IThrow@1',
      dispose() {
        throw new Error('leak');
      },
    });
    const results = runConformance(kit, throwing);
    const lc = results.find((r) => r.id === 'lifecycle')!;
    expect(lc.violations.length).toBeGreaterThan(0);
  });
});

describe('registryConformanceKit: IRegistry 자체 계약(never-throw·dispose·예약·왕복)', () => {
  const kit = registryConformanceKit<number>(-1);

  it('TypedRegistry 팩토리는 전 계약 통과', () => {
    const results = runConformance(kit, () => new TypedRegistry<number>());
    expect(conformancePassed(results)).toBe(true);
    // 각 항목 개별 확인
    for (const r of results) expect(r.violations).toEqual([]);
  });

  it('의도적 위반 레지스트리(예약 미거부)는 실패', () => {
    // 예약 가드가 없는 순진 레지스트리 — reserved 검사에서 위반해야 한다.
    const naive = () => {
      const m = new Map<string, number>();
      return {
        register: (k: string, v: number) => {
          m.set(k, v);
          return { ok: true, action: 'added' as const };
        },
        get: (k: string) => m.get(k),
        require: (k: string, fb?: number) => m.get(k) ?? (fb as number),
        has: (k: string) => m.has(k),
        list: () => [...m.keys()],
        entries: () => [],
        unregister: (k: string) => m.delete(k),
        disposePlugin: () => 0,
        dispose: () => m.clear(),
      };
    };
    const results = runConformance(kit, naive);
    expect(conformancePassed(results)).toBe(false);
    const reserved = results.find((r) => r.id.startsWith('reserved'))!;
    expect(reserved.violations.length).toBeGreaterThan(0);
  });
});
