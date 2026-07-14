// DD-09 §2.5.1 SemVerPolicy(5분기) + §2.5 SchemaMigrator(체인·거부)
import { describe, it, expect } from 'vitest';
import {
  DefaultSemVerPolicy,
  DefaultSchemaMigrator,
  type StateEnvelope,
} from '../../../src/core/state/index.js';

describe('DD-09 §2.5.1 SemVerPolicy.classify — 5분기 라우팅(조용한 오해석 0)', () => {
  const p = new DefaultSemVerPolicy();

  it('같은 major, minor/patch ≤ CURRENT → load(하위호환)', () => {
    expect(p.classify('1.2.0', '1.3.0')).toEqual({ kind: 'load' });
    expect(p.classify('1.3.0', '1.3.0')).toEqual({ kind: 'load' });
    expect(p.classify('1.3.5', '1.3.0')).toEqual({ kind: 'load' }); // patch 무관
  });

  it('같은 major, minor > CURRENT → tolerant(미지 섹션 opaque)', () => {
    const r = p.classify('1.5.0', '1.3.0', { loadedSections: ['columns', 'newThing'], knownSections: ['columns'] });
    expect(r.kind).toBe('tolerant');
    if (r.kind === 'tolerant') expect(r.unknownSections).toEqual(['newThing']);
  });

  it('구 major → migrate(체인)', () => {
    expect(p.classify('1.9.0', '2.0.0')).toEqual({ kind: 'migrate', fromMajor: 1 });
  });

  it('미래 major → reject(오해석 위험)', () => {
    const r = p.classify('3.0.0', '2.0.0');
    expect(r.kind).toBe('reject');
  });

  it('파싱 불가 → reject', () => {
    expect(p.classify('not-semver', '1.0.0').kind).toBe('reject');
    expect(p.classify('1.0', '1.0.0').kind).toBe('reject');
  });

  it('parse 는 정상/비정상 구분', () => {
    expect(p.parse('2.4.7')).toEqual({ major: 2, minor: 4, patch: 7 });
    expect(p.parse('x')).toBeNull();
  });
});

function env(version: string, sections: Record<string, unknown> = {}): StateEnvelope {
  return { schemaVersion: version, savedAt: 0, revision: 0, sections };
}

describe('DD-09 §2.5 SchemaMigrator — major 승격 체인·단계누락 거부', () => {
  it('등록 단계로 구 major 를 승격', () => {
    const m = new DefaultSchemaMigrator('2.0.0').register({
      fromMajor: 1,
      migrate: (e) => ({ ...e, schemaVersion: '2.0.0', sections: { ...e.sections, migrated: true } }),
    });
    const r = m.migrate(env('1.4.0', { columns: [1] }));
    expect('rejected' in r).toBe(false);
    if (!('rejected' in r)) {
      expect(r.env.sections.migrated).toBe(true);
      expect(r.notes).toHaveLength(1);
    }
  });

  it('단계 누락 시 조용한 승격 금지 → rejected', () => {
    const m = new DefaultSchemaMigrator('3.0.0'); // 단계 미등록
    const r = m.migrate(env('1.0.0'));
    expect('rejected' in r).toBe(true);
  });

  it('미래 major 는 승격 불가 거부', () => {
    const m = new DefaultSchemaMigrator('1.0.0');
    const r = m.migrate(env('2.0.0'));
    expect('rejected' in r).toBe(true);
  });

  it('2단계 체인(1→2→3)', () => {
    const m = new DefaultSchemaMigrator('3.0.0')
      .register({ fromMajor: 1, migrate: (e) => ({ ...e, schemaVersion: '2.0.0', sections: { ...e.sections, s1: true } }) })
      .register({ fromMajor: 2, migrate: (e) => ({ ...e, schemaVersion: '3.0.0', sections: { ...e.sections, s2: true } }) });
    const r = m.migrate(env('1.0.0'));
    expect('rejected' in r).toBe(false);
    if (!('rejected' in r)) {
      expect(r.env.sections.s1).toBe(true);
      expect(r.env.sections.s2).toBe(true);
      expect(r.notes).toHaveLength(2);
    }
  });
});
