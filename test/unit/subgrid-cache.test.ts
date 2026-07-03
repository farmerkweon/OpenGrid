import { describe, it, expect, vi } from 'vitest';
import { SubgridCache, type SubgridAdapter } from '../../src/core/detail/SubgridCache.js';

interface FakeInstance { id: string; editing: boolean; }

function makeAdapter() {
  const calls = { create: 0, detach: 0, reattach: 0, destroy: 0 };
  const adapter: SubgridAdapter<FakeInstance> = {
    create: vi.fn((rowId: string) => { calls.create++; return { id: rowId, editing: false }; }),
    detach: vi.fn(() => { calls.detach++; }),
    reattach: vi.fn(() => { calls.reattach++; }),
    destroy: vi.fn(() => { calls.destroy++; }),
  };
  return { adapter, calls };
}

function fakeHost(): HTMLElement {
  return document.createElement('div');
}

describe('SubgridCache (F2 헤드리스 서브그리드 생명주기)', () => {
  describe('mount-once (create 1회 보장)', () => {
    it('getOrCreate 최초 호출에서 adapter.create 정확히 1회', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      const { instance } = cache.getOrCreate('r1', fakeHost);
      expect(adapter.create).toHaveBeenCalledTimes(1);
      expect(instance.id).toBe('r1');
    });

    it('같은 rowId 로 반복 getOrCreate 호출해도 create 는 여전히 1회(재생성 아님)', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      const first = cache.getOrCreate('r1', fakeHost);
      const second = cache.getOrCreate('r1', fakeHost);
      const third = cache.getOrCreate('r1', fakeHost);
      expect(adapter.create).toHaveBeenCalledTimes(1);
      expect(second.instance).toBe(first.instance);
      expect(third.host).toBe(first.host);
    });

    it('hostFactory 는 최초 1회만 호출된다(이미 캐시된 rowId 재호출 시 미호출)', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      const hostFactory = vi.fn(fakeHost);
      cache.getOrCreate('r1', hostFactory);
      cache.getOrCreate('r1', hostFactory);
      expect(hostFactory).toHaveBeenCalledTimes(1);
    });
  });

  describe('detach/reattach (재렌더 생존, §5 핵심 통찰)', () => {
    it('detach 는 attached 상태에서만 adapter.detach 호출, 중복 detach 는 no-op', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      cache.getOrCreate('r1', fakeHost);
      expect(cache.isAttached('r1')).toBe(true);
      expect(cache.detach('r1')).toBe(true);
      expect(adapter.detach).toHaveBeenCalledTimes(1);
      expect(cache.isAttached('r1')).toBe(false);
      expect(cache.detach('r1')).toBe(false); // 이미 분리됨 — no-op
      expect(adapter.detach).toHaveBeenCalledTimes(1);
    });

    it('reattach 는 detach 상태에서만 adapter.reattach 호출, 이미 attached 면 no-op', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      cache.getOrCreate('r1', fakeHost);
      expect(cache.reattach('r1')).toBe(false); // 이미 attached
      cache.detach('r1');
      expect(cache.reattach('r1')).toBe(true);
      expect(adapter.reattach).toHaveBeenCalledTimes(1);
      expect(cache.isAttached('r1')).toBe(true);
    });

    it('detach 후에도 entry(host/instance) 는 Map 에 남아 destroy 되지 않는다(참조 유지=생존)', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      const { instance } = cache.getOrCreate('r1', fakeHost);
      cache.detach('r1');
      expect(adapter.destroy).not.toHaveBeenCalled();
      expect(cache.getInstance('r1')).toBe(instance);
      expect(cache.has('r1')).toBe(true);
    });

    it('detachAll 은 attached 인 모든 entry 를 분리', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      cache.getOrCreate('r1', fakeHost);
      cache.getOrCreate('r2', fakeHost);
      cache.detachAll();
      expect(cache.isAttached('r1')).toBe(false);
      expect(cache.isAttached('r2')).toBe(false);
      expect(adapter.detach).toHaveBeenCalledTimes(2);
    });
  });

  describe('collapse 시 destroy 정책 (§5(5) cache 옵션)', () => {
    it('cache 미지정(기본 false): remove 가 destroy 호출 + entry 제거', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      cache.getOrCreate('r1', fakeHost);
      cache.remove('r1');
      expect(adapter.destroy).toHaveBeenCalledTimes(1);
      expect(cache.has('r1')).toBe(false);
    });

    it('cache:true: remove 는 destroy 하지 않고 detach 만, entry 는 유지(재펼침 재사용)', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      const { instance } = cache.getOrCreate('r1', fakeHost);
      cache.remove('r1', { cache: true });
      expect(adapter.destroy).not.toHaveBeenCalled();
      expect(adapter.detach).toHaveBeenCalledTimes(1);
      expect(cache.has('r1')).toBe(true);
      expect(cache.isAttached('r1')).toBe(false);

      // 재펼침: getOrCreate 가 create 재호출 없이 기존 instance 재사용
      const again = cache.getOrCreate('r1', fakeHost);
      expect(adapter.create).toHaveBeenCalledTimes(1);
      expect(again.instance).toBe(instance);
      expect(cache.isAttached('r1')).toBe(true);
    });

    it('remove 는 존재하지 않는 rowId 에 대해 안전한 no-op', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      expect(() => cache.remove('nope')).not.toThrow();
      expect(adapter.destroy).not.toHaveBeenCalled();
    });
  });

  describe('destroyAll (부모 destroy, EC-9)', () => {
    it('남은 모든 entry 를 destroy 하고 Map 을 비운다', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      cache.getOrCreate('r1', fakeHost);
      cache.getOrCreate('r2', fakeHost);
      cache.destroyAll();
      expect(adapter.destroy).toHaveBeenCalledTimes(2);
      expect(cache.size).toBe(0);
    });
  });

  describe('편집중 skip-rebuild 훅 자리(§5(4), Phase1 배선 대상)', () => {
    it('isEditingFn 미지정 시 항상 false(배선 전 안전 기본값)', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      cache.getOrCreate('r1', fakeHost);
      expect(cache.isEditing('r1')).toBe(false);
    });

    it('isEditingFn 이 지정되면 해당 인스턴스를 넘겨 판정을 위임한다', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      const { instance } = cache.getOrCreate('r1', fakeHost);
      instance.editing = true;
      expect(cache.isEditing('r1', (inst) => inst.editing)).toBe(true);
      expect(cache.isEditing('r1', (inst) => !inst.editing)).toBe(false);
    });

    it('존재하지 않는 rowId 는 isEditingFn 이 있어도 false', () => {
      const { adapter } = makeAdapter();
      const cache = new SubgridCache(adapter);
      expect(cache.isEditing('nope', () => true)).toBe(false);
    });
  });
});
