// Keep at most one immediate bridge call in flight. Cancellation never writes
// an old position back, and navigation can wait for that last call to finish.
function createPageScroller({ scrollTo, isActive, now = Date.now, schedule = setTimeout, unschedule = clearTimeout }) {
  let version = 0;
  let timer;
  let inFlight = false;
  let afterFlight;

  function cancel() {
    version++;
    unschedule(timer);
    timer = undefined;
    afterFlight = undefined;
  }

  function whenIdle(callback) {
    if (inFlight) afterFlight = callback;
    else callback();
  }

  function start({ from, to, duration }) {
    cancel();
    const current = version;
    const started = now();
    const step = () => {
      timer = undefined;
      if (current !== version || !isActive()) return;
      const progress = Math.min(1, Math.max(0, (now() - started) / duration));
      const eased = progress * progress * (3 - 2 * progress);
      let failed = false;
      inFlight = true;
      scrollTo({
        scrollTop: from + (to - from) * eased,
        duration: 0,
        fail() { failed = true; },
        complete() {
          inFlight = false;
          if (afterFlight) {
            const callback = afterFlight;
            afterFlight = undefined;
            callback();
          } else if (!failed && current === version && isActive() && progress < 1) {
            timer = schedule(step, 16);
          }
        },
      });
    };
    // Callers measure again after whenIdle, so a new run never starts from a
    // position sampled while a preceding bridge command is still pending.
    timer = schedule(step, 16);
  }

  return { start, cancel, whenIdle };
}

module.exports = { createPageScroller };
