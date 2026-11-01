// Scroll only the page's active viewport, with the same pace on mobile and desktop.
export function createResultScroller(view = globalThis.window) {
  let frame;
  let removeListeners = () => {};

  function cancel() {
    if (frame != null) view.cancelAnimationFrame(frame);
    frame = undefined;
    removeListeners();
    removeListeners = () => {};
  }

  function scrollTo(target) {
    cancel();
    if (!view || !target) return;
    const body = target.closest('.mp-body');
    const nested = body && /auto|scroll/.test(view.getComputedStyle(body).overflowY);
    const owner = nested ? body : view;
    const top = nested ? body.scrollTop : view.scrollY;
    const left = nested ? body.scrollLeft : view.scrollX;
    const height = nested ? body.clientHeight : view.innerHeight;
    const relativeTop = target.getBoundingClientRect().top - (nested ? body.getBoundingClientRect().top : 0);
    // The heading is already comfortably in view; leave the user's position alone.
    if (relativeTop >= 16 && relativeTop <= Math.min(160, height / 4)) return;
    // Results may still be loading. Keep the heading as our destination rather
    // than fixing the endpoint to the shorter loading state's scroll height.
    // The browser clamps each frame to the currently available page height.
    const end = Math.max(0, top + relativeTop - 16);
    const distance = end - top;
    if (Math.abs(distance) < 2) return;
    const move = value => owner.scrollTo({ top: value, left, behavior: 'instant' });
    if (view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      move(end);
      return;
    }

    const duration = Math.min(850, Math.max(450, 420 + Math.abs(distance) * .35));
    const started = view.performance.now();
    const onKey = event => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Escape'].includes(event.key)) cancel();
    };
    const gestures = ['wheel', 'touchstart', 'pointerdown'];
    for (const name of gestures) view.addEventListener(name, cancel, { passive: true, capture: true });
    view.addEventListener('keydown', onKey, true);
    removeListeners = () => {
      for (const name of gestures) view.removeEventListener(name, cancel, true);
      view.removeEventListener('keydown', onKey, true);
    };
    const step = now => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      move(top + distance * eased);
      if (progress < 1) frame = view.requestAnimationFrame(step);
      else cancel();
    };
    frame = view.requestAnimationFrame(step);
  }

  return { scrollTo, cancel };
}
