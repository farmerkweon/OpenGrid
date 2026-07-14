// DD-14 §2.5 CapabilityRegistry + 패리티 매트릭스(REQ-T8-884, P0 100% 게이트).
import { describe, it, expect } from 'vitest';
import {
  CapabilityRegistry,
  CAPABILITY_REGISTRY,
  computeParity,
  type AdapterConformance,
  type Capability,
} from '../../../src/core/host/CapabilityRegistry.js';

const CAPS: Capability[] = [
  { id: 'data.set', priority: 'P0' },
  { id: 'lifecycle.mount', priority: 'P0' },
  { id: 'theme.live', priority: 'P1' },
];

function conf(adapter: AdapterConformance['adapter'], exposed: string[], match: string[]): AdapterConformance {
  return { adapter, exposed: new Set(exposed), behaviorMatch: new Set(match) };
}

describe('DD-14 CapabilityRegistry', () => {
  it('SSOT snapshot lists all ids and P0 subset', () => {
    const snap = CAPABILITY_REGISTRY.snapshot();
    expect(snap.ids).toContain('data.set');
    expect(snap.p0Ids).toContain('lifecycle.mount');
    expect(snap.p0Ids).not.toContain('theme.live'); // P1.
    expect(snap.p0Ids.every((id) => snap.ids.includes(id))).toBe(true);
  });

  it('register is additive and idempotent by id', () => {
    const r = new CapabilityRegistry();
    r.register({ id: 'x', priority: 'P0' }).register({ id: 'x', priority: 'P2' });
    expect(r.list()).toHaveLength(1);
    expect(r.get('x')?.priority).toBe('P2');
  });
});

describe('DD-14 computeParity (P0 100% gate)', () => {
  it('all P0 exposed+matched across all adapters → p0Pass true, no gaps', () => {
    const confs = (['react', 'vue', 'jquery', 'vanilla'] as const).map((a) =>
      conf(a, ['data.set', 'lifecycle.mount', 'theme.live'], ['data.set', 'lifecycle.mount', 'theme.live']),
    );
    const m = computeParity(CAPS, confs);
    expect(m.p0Pass).toBe(true);
    expect(m.p0Gaps).toHaveLength(0);
    expect(m.perAdapter.every((a) => a.exposureRate === 1)).toBe(true);
  });

  it('missing P0 exposure on one adapter → p0Pass false with the gap listed', () => {
    const confs = [
      conf('react', ['data.set', 'lifecycle.mount'], ['data.set', 'lifecycle.mount']),
      conf('vue', ['data.set'], ['data.set']), // lifecycle.mount 미노출 → P0 gap.
    ];
    const m = computeParity(CAPS, confs);
    expect(m.p0Pass).toBe(false);
    expect(m.p0Gaps.some((c) => c.adapter === 'vue' && c.capabilityId === 'lifecycle.mount')).toBe(true);
  });

  it('P1 gap does NOT fail the P0 gate', () => {
    const confs = [conf('vanilla', ['data.set', 'lifecycle.mount'], ['data.set', 'lifecycle.mount'])];
    const m = computeParity(CAPS, confs); // theme.live(P1) 미노출.
    expect(m.p0Pass).toBe(true);
    expect(m.perAdapter[0].exposureRate).toBeCloseTo(2 / 3);
  });

  it('exposed-but-not-behaviorMatch P0 still counts as a gap', () => {
    const confs = [conf('react', ['data.set', 'lifecycle.mount'], ['data.set'])]; // mount 노출됐지만 동형 미일치.
    const m = computeParity(CAPS, confs);
    expect(m.p0Pass).toBe(false);
    expect(m.p0Gaps.some((c) => c.capabilityId === 'lifecycle.mount' && c.exposed && !c.behaviorMatch)).toBe(true);
  });
});
