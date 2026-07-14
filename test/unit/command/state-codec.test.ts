// DD-09 §2.5 StateCodec — 왕복 동일성(REQ-T9-808)·미지 섹션 opaque 보존·부분복구·거부·마이그레이션
import { describe, it, expect } from 'vitest';
import {
  StateCodec,
  DefaultSchemaMigrator,
  type ISectionCodec,
  type StateEnvelope,
} from '../../../src/core/state/index.js';

/** 인메모리 섹션 코덱 — 조각 소유 DD 를 헤드리스로 대역. */
function section(key: string, store: { value: unknown }, opts: { failOn?: unknown } = {}): ISectionCodec {
  return {
    key,
    toState: () => store.value,
    fromState: (raw) => {
      if (opts.failOn !== undefined && JSON.stringify(raw) === JSON.stringify(opts.failOn)) {
        return { partial: { reason: `삭제된 참조 로드 실패(${key})` } };
      }
      store.value = raw;
      return { restored: true };
    },
  };
}

describe('DD-09 §2.5 StateCodec — 왕복 동일성(REQ-T9-808 골든)', () => {
  it('setState(getState()) 는 손실경계 내 동일(round-trip)', () => {
    const cols = { value: { widths: [80, 120], frozen: 2 } };
    const sort = { value: [{ field: 'amt', dir: 'asc' }] };
    const codec = new StateCodec({
      current: '1.0.0',
      sections: [section('columns', cols), section('sort', sort)],
    });
    const a = codec.getState();
    const res = codec.setState(a);
    expect(res.ok).toBe(true);
    expect(res.restored.sort()).toEqual(['columns', 'sort']);
    const b = codec.getState();
    expect(codec.roundTripEquals(a, b).equal).toBe(true);
  });

  it('봉투는 schemaVersion·revision 권위를 심는다', () => {
    const codec = new StateCodec({ current: '2.1.0', sections: [], revision: () => 42, now: () => 999 });
    const env = codec.getState();
    expect(env.schemaVersion).toBe('2.1.0');
    expect(env.revision).toBe(42);
    expect(env.savedAt).toBe(999);
  });
});

describe('DD-09 §2.5.1 StateCodec.setState — semver 라우팅', () => {
  function envOf(version: string, sections: Record<string, unknown>): StateEnvelope {
    return { schemaVersion: version, savedAt: 0, revision: 0, sections };
  }

  it('같은 major 미래 minor → 미지 섹션 opaque 보존 + partial 신고', () => {
    const cols = { value: { w: 1 } };
    const codec = new StateCodec({ current: '1.2.0', sections: [section('columns', cols)] });
    const loaded = envOf('1.9.0', { columns: { w: 9 }, futureFeature: { magic: true } });
    const res = codec.setState(loaded);
    expect(res.ok).toBe(true);
    expect(res.restored).toContain('columns');
    expect(res.partial.some((p) => p.section === 'futureFeature')).toBe(true);
    // opaque 보존 → 재저장 시 되돌려씀(round-trip 무손실).
    const re = codec.getState();
    expect(re.sections.futureFeature).toEqual({ magic: true });
  });

  it('미래 major → 명확한 거부(rejected)', () => {
    const codec = new StateCodec({ current: '1.0.0', sections: [] });
    const res = codec.setState({ schemaVersion: '3.0.0', savedAt: 0, revision: 0, sections: {} });
    expect(res.ok).toBe(false);
    expect(res.rejected).toBeTruthy();
  });

  it('비 봉투 입력 → 거부', () => {
    const codec = new StateCodec({ current: '1.0.0', sections: [] });
    expect(codec.setState(null).ok).toBe(false);
    expect(codec.setState({ foo: 1 }).ok).toBe(false);
  });

  it('구 major → 마이그레이터 위임(주입 시 승격)', () => {
    const cols = { value: null as unknown };
    const migrator = new DefaultSchemaMigrator('2.0.0').register({
      fromMajor: 1,
      migrate: (e) => ({ ...e, schemaVersion: '2.0.0' }),
    });
    const codec = new StateCodec({ current: '2.0.0', sections: [section('columns', cols)], migrator });
    const res = codec.setState(envOf('1.0.0', { columns: { migrated: 1 } }));
    expect(res.ok).toBe(true);
    expect(cols.value).toEqual({ migrated: 1 });
  });

  it('구 major 인데 마이그레이터 미주입 → 거부', () => {
    const codec = new StateCodec({ current: '2.0.0', sections: [] });
    const res = codec.setState(envOf('1.0.0', {}));
    expect(res.ok).toBe(false);
  });

  it('조각 fromState 부분실패는 partial 로 표면화(조용한 실패 0)', () => {
    const sort = { value: null as unknown };
    const codec = new StateCodec({
      current: '1.0.0',
      sections: [section('sort', sort, { failOn: { badRef: true } })],
    });
    const res = codec.setState(envOf('1.0.0', { sort: { badRef: true } }));
    expect(res.ok).toBe(true);
    expect(res.partial.some((p) => p.section === 'sort')).toBe(true);
    expect(res.restored).not.toContain('sort');
  });
});

describe('DD-09 §2.5 roundTripEquals — 손실 diff 표면화', () => {
  it('섹션이 다르면 diffs 에 키가 뜬다', () => {
    const codec = new StateCodec({ current: '1.0.0', sections: [] });
    const a: StateEnvelope = { schemaVersion: '1.0.0', savedAt: 0, revision: 0, sections: { x: 1, y: 2 } };
    const b: StateEnvelope = { schemaVersion: '1.0.0', savedAt: 0, revision: 0, sections: { x: 1, y: 3 } };
    const d = codec.roundTripEquals(a, b);
    expect(d.equal).toBe(false);
    expect(d.diffs).toEqual(['y']);
  });
});
