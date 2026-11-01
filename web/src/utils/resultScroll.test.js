import { describe, expect, it, vi } from 'vitest';
import { createResultScroller } from './resultScroll';

function viewport({ nested = true, reduced = false, relativeTop = 1000 } = {}) {
  const frames = new Map();
  const listeners = new Map();
  let nextFrame = 0;
  let now = 0;
  const body = {
    scrollTop: 0, scrollLeft: 0, clientHeight: 800, scrollHeight: 4000,
    getBoundingClientRect: () => ({ top: 0 }),
    scrollTo: vi.fn(({ top }) => { body.scrollTop = top; }),
  };
  const view = {
    scrollY: 0, scrollX: 0, innerHeight: 800,
    document: { documentElement: { scrollHeight: 4000 } },
    getComputedStyle: () => ({ overflowY: nested ? 'auto' : 'visible' }),
    matchMedia: () => ({ matches: reduced }),
    performance: { now: () => now },
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
    scrollTo: vi.fn(({ top }) => { view.scrollY = top; }),
    addEventListener: (event, fn) => listeners.set(event, fn),
    removeEventListener: event => listeners.delete(event),
  };
  const target = {
    closest: () => body,
    getBoundingClientRect: () => ({ top: relativeTop - (nested ? body.scrollTop : view.scrollY) }),
  };
  const step = time => {
    now = time;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(fn => fn(time));
  };
  return { view, body, target, step, frames, listeners, scroller: createResultScroller(view) };
}

describe('result scrolling', () => {
  it('uses a gentle start and finish for a long scroll inside the mobile viewport', () => {
    const { scroller, target, body, view, step, frames, listeners } = viewport();
    scroller.scrollTo(target);
    step(100);
    const first = body.scrollTop;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(80);
    step(300);
    expect(body.scrollTop).toBeLessThan(984);
    step(700);
    const remaining = 984 - body.scrollTop;
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThan(30);
    step(900);
    expect(body.scrollTop).toBe(984);
    expect(view.scrollTo).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it('uses the window on desktop without moving the nested body', () => {
    const { scroller, target, body, view, step } = viewport({ nested: false });
    scroller.scrollTo(target);
    step(900);
    expect(view.scrollY).toBe(984);
    expect(body.scrollTo).not.toHaveBeenCalled();
  });

  it('reaches the heading when results extend a short loading state during scrolling', () => {
    const { scroller, target, body, step } = viewport();
    body.scrollHeight = 1600;
    body.scrollTo.mockImplementation(({ top }) => {
      body.scrollTop = Math.min(top, body.scrollHeight - body.clientHeight);
    });
    scroller.scrollTo(target);
    step(500);
    expect(body.scrollTop).toBeLessThan(800);
    body.scrollHeight = 4000;
    step(900);
    expect(body.scrollTop).toBe(984);
  });

  it.each(['wheel', 'touchstart', 'pointerdown', 'keydown'])('lets %s interrupt the automatic motion', event => {
    const { scroller, target, body, step, listeners, frames } = viewport();
    scroller.scrollTo(target);
    step(200);
    const stoppedAt = body.scrollTop;
    listeners.get(event)({ key: 'PageDown' });
    step(900);
    expect(body.scrollTop).toBe(stoppedAt);
    expect(frames.size).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it('replaces a running animation from its current position and supports cleanup', () => {
    const { scroller, target, body, step, frames, listeners } = viewport();
    scroller.scrollTo(target);
    step(200);
    const previous = body.scrollTop;
    scroller.scrollTo(target);
    expect(frames.size).toBe(1);
    step(250);
    expect(body.scrollTop).toBeGreaterThan(previous);
    scroller.cancel();
    const stoppedAt = body.scrollTop;
    step(1000);
    expect(body.scrollTop).toBe(stoppedAt);
    expect(listeners.size).toBe(0);
  });

  it('respects reduced motion without scheduling an animation', () => {
    const { scroller, target, body, frames, listeners } = viewport({ reduced: true });
    scroller.scrollTo(target);
    expect(body.scrollTop).toBe(984);
    expect(frames.size).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it('leaves an already visible result heading in place', () => {
    const { scroller, target, body, frames } = viewport({ relativeTop: 100 });
    scroller.scrollTo(target);
    expect(body.scrollTo).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
});
