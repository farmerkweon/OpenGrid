import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../../src/core/EventEmitter.js';

describe('EventEmitter', () => {
  it('on / emit - 이벤트 수신', () => {
    const ee = new EventEmitter();
    const fn = vi.fn();
    ee.on('test', fn);
    ee.emit('test', 1, 2);
    expect(fn).toHaveBeenCalledWith(1, 2);
  });

  it('once - 1회만 수신', () => {
    const ee = new EventEmitter();
    const fn = vi.fn();
    ee.once('test', fn);
    ee.emit('test');
    ee.emit('test');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('off - 핸들러 제거', () => {
    const ee = new EventEmitter();
    const fn = vi.fn();
    ee.on('test', fn);
    ee.off('test', fn);
    ee.emit('test');
    expect(fn).not.toHaveBeenCalled();
  });

  it('off - 핸들러 없이 전체 제거', () => {
    const ee = new EventEmitter();
    const fn1 = vi.fn(), fn2 = vi.fn();
    ee.on('test', fn1).on('test', fn2);
    ee.off('test');
    ee.emit('test');
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  it('체이닝 지원 (on 체이닝)', () => {
    const ee = new EventEmitter();
    const fn = vi.fn();
    ee.on('a', fn).on('b', fn);
    ee.emit('a');
    ee.emit('b');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('listenerCount', () => {
    const ee = new EventEmitter();
    ee.on('x', () => {}).on('x', () => {});
    expect(ee.listenerCount('x')).toBe(2);
  });

  it('removeAllListeners - 전체 제거', () => {
    const ee = new EventEmitter();
    const fn = vi.fn();
    ee.on('a', fn).on('b', fn);
    ee.removeAllListeners();
    ee.emit('a'); ee.emit('b');
    expect(fn).not.toHaveBeenCalled();
  });
});
