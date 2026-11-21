// Keeps host timer handles scoped to one Window and cancels them on close.
type TimerHandler = ((...args: unknown[]) => unknown) | string;

/** Creates the browser timer registry for a single browsing context. */
export function createWindowTimers(invoke: (handler: TimerHandler, args: unknown[]) => void) {
  let nextId = 1;
  let closed = false;
  let handles: Map<number, ReturnType<typeof setTimeout>> | undefined;

  function schedule(
    repeat: boolean,
    handler: TimerHandler,
    delay: number,
    args: unknown[],
  ): number {
    if (closed) return 0;
    const id = nextId++;
    const timers = (handles ??= new Map());
    const run = () => {
      if (!repeat) timers.delete(id);
      invoke(handler, args);
    };
    const milliseconds = Math.max(0, Number(delay) | 0);
    timers.set(id, repeat ? setInterval(run, milliseconds) : setTimeout(run, milliseconds));
    return id;
  }

  function cancel(id: number): void {
    const index = Number(id) | 0;
    const handle = handles?.get(index);
    if (!handle) return;
    clearTimeout(handle);
    handles?.delete(index);
  }

  return {
    setTimeout(handler: TimerHandler, delay = 0, ...args: unknown[]): number {
      return schedule(false, handler, delay, args);
    },
    setInterval(handler: TimerHandler, delay = 0, ...args: unknown[]): number {
      return schedule(true, handler, delay, args);
    },
    cancel,
    close(): void {
      closed = true;
      if (handles) {
        for (const handle of handles.values()) clearTimeout(handle);
        handles.clear();
      }
    },
  };
}
