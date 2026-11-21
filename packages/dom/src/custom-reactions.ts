// Owns per-element reaction FIFOs shared by DOM operations across Window realms.
type Queue = { readonly callbacks: (() => void)[]; next: number; invoking: number };
const queues = new WeakMap<object, Queue>();

/** Appends trusted, exception-reporting work without invoking author code. */
export function enqueueCustomReaction(element: object, callback: () => void): void {
  let queue = queues.get(element);
  if (!queue) {
    queue = { callbacks: [], next: 0, invoking: 0 };
    queues.set(element, queue);
  }
  queue.callbacks.push(callback);
}

/** Drains an element's FIFO, including reactions reached by nested DOM operations. */
export function invokeCustomReactions(element: object): void {
  const queue = queues.get(element);
  if (!queue) return;
  queue.invoking++;
  try {
    // The queue is finite unless author callbacks keep producing more author work.
    while (queue.next < queue.callbacks.length) {
      const callback = queue.callbacks[queue.next++];
      if (!callback) throw new Error("A queued custom-element reaction must exist");
      callback();
    }
  } finally {
    queue.invoking--;
    if (!queue.invoking && queues.get(element) === queue) queues.delete(element);
  }
}

/** Clears pending upgrade reactions when construction fails. */
export function discardCustomReactions(element: object): void {
  const queue = queues.get(element);
  if (!queue) return;
  queue.callbacks.length = queue.next;
  if (!queue.invoking) queues.delete(element);
}
