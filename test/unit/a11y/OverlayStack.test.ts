import { describe, it, expect } from 'vitest';
import { OverlayStack } from '../../../src/core/a11y/OverlayStack';
import type { OverlayFrame } from '../../../src/core/a11y/OverlayStack';

const frame = (id: string, returnFocusTo: string, over: Partial<OverlayFrame> = {}): OverlayFrame => ({
  id, returnFocusTo, role: 'dialog', ...over,
});

describe('OverlayStack — Esc/포커스 복귀 (REQ-T9-830)', () => {
  it('Esc 는 최상위 1개만 닫고 직전 층으로 포커스 복귀, 나머지 스택 유지', () => {
    const st = new OverlayStack('grid');
    st.push(frame('dialog', 'cell:0:0', { role: 'dialog' }));
    st.push(frame('dropdown', 'dialog', { role: 'listbox' }));
    st.push(frame('tooltip', 'dropdown', { role: 'img' }));
    expect(st.top()?.id).toBe('tooltip');
    expect(st.size()).toBe(3);

    expect(st.handleEsc()).toEqual({ target: 'dropdown', reason: 'overlayClose' });
    expect(st.size()).toBe(2);
    expect(st.top()?.id).toBe('dropdown');

    expect(st.handleEsc()).toEqual({ target: 'dialog', reason: 'overlayClose' });
    expect(st.handleEsc()).toEqual({ target: 'cell:0:0', reason: 'overlayClose' });
    expect(st.size()).toBe(0);
  });

  it('빈 스택 Esc 는 null(무동작 — 그리드가 소비)', () => {
    const st = new OverlayStack();
    expect(st.handleEsc()).toBeNull();
    expect(st.top()).toBeUndefined();
  });

  it('복귀 대상이 고아(빈 문자열)면 폴백으로 이관', () => {
    const st = new OverlayStack('grid');
    st.push(frame('dialog', '', { modal: true }));
    expect(st.handleEsc()).toEqual({ target: 'grid', reason: 'overlayClose' });
  });

  it('dispose 는 스택을 비운다', () => {
    const st = new OverlayStack();
    st.push(frame('a', 'grid'));
    st.dispose();
    expect(st.size()).toBe(0);
  });
});
