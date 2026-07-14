import { describe, it, expect } from 'vitest';
import { LiveRegionController } from '../../../src/core/a11y/LiveRegionController';
import type { Announcement } from '../../../src/core/a11y/LiveRegionController';
import { FakeRenderPort, manualScheduler } from './_helpers';

function make(opts?: { debounceMs?: number; assertiveImmediate?: boolean; t?: (k: string, p?: any) => string }) {
  const render = new FakeRenderPort();
  const sched = manualScheduler();
  const ctrl = new LiveRegionController({
    render,
    schedule: sched.schedule,
    cancel: sched.cancel,
    ...(opts?.debounceMs !== undefined ? { debounceMs: opts.debounceMs } : {}),
    ...(opts?.assertiveImmediate !== undefined ? { assertiveImmediate: opts.assertiveImmediate } : {}),
    ...(opts?.t ? { t: opts.t } : {}),
  });
  return { render, sched, ctrl };
}

const A = (over: Partial<Announcement> = {}): Announcement => ({
  channel: 'polite', priority: 1, mergeKey: 'm', messageKey: 'k', ...over,
});

describe('LiveRegionController — 병합/디바운스 (REQ-T9-821)', () => {
  it('같은 mergeKey 연속 공지는 마지막 1건으로 병합(coalesce)', () => {
    const { render, sched, ctrl } = make();
    ctrl.enqueue(A({ mergeKey: 'sort', messageKey: 'sort.asc' }));
    ctrl.enqueue(A({ mergeKey: 'sort', messageKey: 'sort.desc' }));
    ctrl.enqueue(A({ mergeKey: 'sort', messageKey: 'sort.none' }));
    expect(render.spoken.length).toBe(0); // 디바운스 전엔 미발화. / not spoken before debounce.
    sched.flush();
    expect(render.spoken.length).toBe(1); // 마지막 상태만 1회. / only the last state, once.
    expect(render.spoken[0]!.text).toBe('sort.none');
    expect(ctrl.metrics()).toEqual({ spoken: 1, coalesced: 2, dropped: 0 });
  });

  it('polite flush 는 우선순위 내림차순으로 발화한다', () => {
    const { render, sched, ctrl } = make();
    ctrl.enqueue(A({ mergeKey: 'low', priority: 1, messageKey: 'low' }));
    ctrl.enqueue(A({ mergeKey: 'high', priority: 9, messageKey: 'high' }));
    sched.flush();
    expect(render.spoken.map(s => s.text)).toEqual(['high', 'low']);
  });

  it('t() 로 messageKey 를 해석해 발화한다(하드코딩 금지)', () => {
    const { render, sched, ctrl } = make({ t: (k, p) => `${k}:${p?.n ?? ''}` });
    ctrl.enqueue(A({ messageKey: 'range.selectionAnnounce', params: { n: 5 } }));
    sched.flush();
    expect(render.spoken[0]!.text).toBe('range.selectionAnnounce:5');
  });
});

describe('LiveRegionController — assertive 즉시 발화 (R1)', () => {
  it('assertiveImmediate=true 면 디바운스를 우회해 즉시 발화', () => {
    const { render, ctrl } = make();
    ctrl.enqueue(A({ channel: 'assertive', priority: 100, messageKey: 'err' }));
    expect(render.spoken.length).toBe(1);
    expect(render.spoken[0]).toEqual({ channel: 'assertive', text: 'err' });
  });

  it('assertiveImmediate=false 면 디바운스 창을 통과한다', () => {
    const { render, sched, ctrl } = make({ assertiveImmediate: false });
    ctrl.enqueue(A({ channel: 'assertive', messageKey: 'err' }));
    expect(render.spoken.length).toBe(0);
    sched.flush();
    expect(render.spoken.length).toBe(1);
  });
});

describe('LiveRegionController — 배경 억제 (REQ-T9-822)', () => {
  it('userBusy 중 배경 공지는 억제되고 편집 종료 시 방출', () => {
    const { render, sched, ctrl } = make();
    ctrl.setUserBusy(true);
    ctrl.enqueue(A({ mergeKey: 'bg-update', background: true, messageKey: 'bg' }));
    sched.flush();
    expect(render.spoken.length).toBe(0); // 편집 중 억제. / suppressed while busy.
    ctrl.setUserBusy(false);
    sched.flush();
    expect(render.spoken.length).toBe(1); // 종료 후 방출. / released after busy ends.
  });

  it('userBusy 중에도 비-배경 공지는 발화한다', () => {
    const { render, sched, ctrl } = make();
    ctrl.setUserBusy(true);
    ctrl.enqueue(A({ mergeKey: 'sel', messageKey: 'sel' }));
    sched.flush();
    expect(render.spoken.length).toBe(1);
  });
});

describe('LiveRegionController — drop/dispose', () => {
  it('drop 은 큐에서 제거하고 dropped 를 계측한다(UC-2 E1)', () => {
    const { render, sched, ctrl } = make();
    ctrl.enqueue(A({ mergeKey: 'sort', messageKey: 'sort' }));
    ctrl.drop('sort');
    sched.flush();
    expect(render.spoken.length).toBe(0);
    expect(ctrl.metrics().dropped).toBe(1);
  });

  it('dispose 후 enqueue 는 무동작', () => {
    const { render, sched, ctrl } = make();
    ctrl.dispose();
    ctrl.enqueue(A());
    sched.flush();
    expect(render.spoken.length).toBe(0);
  });
});
