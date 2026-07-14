// DD-09 §2.6·§2.7 AutosaveController(RPO·크래시복구·초안) + MultiTabGuard(클로버 방지) + IStatePersistence
import { describe, it, expect, vi } from 'vitest';
import {
  AutosaveController,
  MultiTabGuard,
  InMemoryStatePersistence,
  StateCodec,
  type ISectionCodec,
  type PersistedRecord,
  type StateEnvelope,
} from '../../../src/core/state/index.js';

function section(key: string, store: { value: unknown }): ISectionCodec {
  return {
    key,
    toState: () => store.value,
    fromState: (raw) => {
      store.value = raw;
      return { restored: true };
    },
  };
}

function makeCodec(store: { value: unknown }, rev: () => number): StateCodec {
  return new StateCodec({ current: '1.0.0', sections: [section('data', store)], revision: rev, now: () => 0 });
}

describe('DD-09 §2.6 AutosaveController — RPO 계약', () => {
  it('N 조작 임계 도달 시 저장(ops RPO)', async () => {
    const cell = { value: { n: 0 } };
    let rev = 0;
    const codec = makeCodec(cell, () => rev);
    const store = new InMemoryStatePersistence();
    const ac = new AutosaveController({
      docId: 'doc',
      codec,
      store,
      policy: { maxIntervalMs: 999999, maxOpsBetweenSaves: 3 },
      now: () => 0,
    });
    ac.onCommand();
    ac.onCommand();
    expect(ac.saveCount).toBe(0); // 아직 임계 미달
    rev = 1;
    ac.onCommand(); // 3번째 → 저장
    await Promise.resolve();
    expect(ac.saveCount).toBe(1);
    expect(store.peek('doc')?.revision).toBe(1);
    expect(ac.opsSinceSave).toBe(0); // 리셋
  });

  it('시간 임계 도달 시 저장(time RPO ≤ maxIntervalMs)', async () => {
    let t = 0;
    const cell = { value: 1 };
    const codec = makeCodec(cell, () => 0);
    const store = new InMemoryStatePersistence();
    const ac = new AutosaveController({
      docId: 'doc',
      codec,
      store,
      policy: { maxIntervalMs: 30000, maxOpsBetweenSaves: 999 },
      now: () => t,
    });
    ac.onCommand();
    expect(ac.saveCount).toBe(0);
    t = 30000; // 임계 도달
    ac.onCommand();
    await Promise.resolve();
    expect(ac.saveCount).toBe(1);
  });

  it('flush 는 강제 저장', async () => {
    const cell = { value: 'x' };
    const codec = makeCodec(cell, () => 5);
    const store = new InMemoryStatePersistence();
    const ac = new AutosaveController({ docId: 'd', codec, store, policy: { maxIntervalMs: 1, maxOpsBetweenSaves: 1 }, now: () => 0 });
    expect(await ac.flush()).toBe(true);
    expect(store.peek('d')?.revision).toBe(5);
  });
});

describe('DD-09 §2.6 크래시 복구·초안 충돌', () => {
  it('detectDraft 는 저장된 초안을 자동 덮어쓰지 않고 발견만 보고', async () => {
    const cell = { value: { current: true } };
    const codec = makeCodec(cell, () => 1);
    const store = new InMemoryStatePersistence();
    const draftEnv: StateEnvelope = { schemaVersion: '1.0.0', savedAt: 12345, revision: 7, sections: { data: { draft: true } } };
    await store.save('doc', { env: draftEnv, tabId: 'other', revision: 7, savedAt: 12345 });

    const ac = new AutosaveController({ docId: 'doc', codec, store, policy: { maxIntervalMs: 1, maxOpsBetweenSaves: 1 } });
    const draft = await ac.detectDraft();
    expect(draft.hasDraft).toBe(true);
    expect(draft.draftSavedAt).toBe(12345);
    expect(draft.loadedRevision).toBe(7);
    // 아직 로드 안 됨(자동 덮어쓰기 금지).
    expect(cell.value).toEqual({ current: true });
    // 호스트가 restore 선택 시에만 로드.
    draft.restore();
    expect(cell.value).toEqual({ draft: true });
  });

  it('초안 없으면 hasDraft=false', async () => {
    const codec = makeCodec({ value: 1 }, () => 0);
    const ac = new AutosaveController({ docId: 'none', codec, store: new InMemoryStatePersistence(), policy: { maxIntervalMs: 1, maxOpsBetweenSaves: 1 } });
    expect((await ac.detectDraft()).hasDraft).toBe(false);
  });
});

describe('DD-09 §2.7 MultiTabGuard — revision 낙관적 잠금(클로버 방지)', () => {
  function rec(tabId: string, revision: number): PersistedRecord {
    return { env: { schemaVersion: '1.0.0', savedAt: 0, revision, sections: {} }, tabId, revision, savedAt: 0 };
  }

  it('다른 탭이 앞선 리비전을 썼으면 저장 전 충돌', () => {
    const guard = new MultiTabGuard('B');
    guard.observe(rec('A', 42)); // 탭 A 가 42 로 저장
    const r = guard.checkBeforeSave(41); // 탭 B 는 base 41
    expect(r).not.toBe('ok');
    if (r !== 'ok') expect(r.conflict.tabId).toBe('A');
  });

  it('내 base 가 최신이면 ok(충돌 아님)', () => {
    const guard = new MultiTabGuard('B');
    guard.observe(rec('A', 41));
    expect(guard.checkBeforeSave(41)).toBe('ok');
  });

  it('내 탭 자신의 저장은 충돌로 보지 않음', () => {
    const guard = new MultiTabGuard('B');
    guard.observe(rec('B', 50));
    expect(guard.checkBeforeSave(10)).toBe('ok');
  });

  it('onExternalSave 는 다른 탭 저장을 경고(TabConflictNotice)', () => {
    const guard = new MultiTabGuard('B');
    const notice = guard.onExternalSave(rec('A', 9));
    expect(notice).not.toBeNull();
    expect(notice?.otherTabId).toBe('A');
    expect(guard.onExternalSave(rec('B', 10))).toBeNull(); // 내 탭 → null
  });

  it('AutosaveController 는 저장 전 충돌 시 저장 생략 + onConflict', async () => {
    const codec = makeCodec({ value: 1 }, () => 0);
    const store = new InMemoryStatePersistence();
    const guard = new MultiTabGuard('B');
    guard.observe(rec('A', 100)); // 다른 탭이 앞섬(base 는 -1)
    const onConflict = vi.fn();
    const ac = new AutosaveController({ docId: 'd', codec, store, policy: { maxIntervalMs: 1, maxOpsBetweenSaves: 1 }, tabId: 'B', guard, onConflict });
    const ok = await ac.flush();
    expect(ok).toBe(false);
    expect(onConflict).toHaveBeenCalledOnce();
    expect(store.peek('d')).toBeNull(); // 조용히 덮지 않음
  });
});

describe('DD-09 §2.6 IStatePersistence — InMemory 어댑터', () => {
  it('save/load 왕복 + subscribe 통지', async () => {
    const store = new InMemoryStatePersistence();
    const cb = vi.fn();
    const off = store.subscribe('doc', cb);
    const record: PersistedRecord = { env: { schemaVersion: '1.0.0', savedAt: 0, revision: 1, sections: {} }, tabId: 't', revision: 1, savedAt: 0 };
    await store.save('doc', record);
    expect(await store.load('doc')).toEqual(record);
    expect(cb).toHaveBeenCalledWith(record);
    off();
    await store.save('doc', record);
    expect(cb).toHaveBeenCalledOnce(); // 구독 해제 후 통지 없음
  });

  it('없는 docId 로드는 null', async () => {
    expect(await new InMemoryStatePersistence().load('nope')).toBeNull();
  });
});
