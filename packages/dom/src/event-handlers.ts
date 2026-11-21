// Maintains event handler slots without changing their listener order on reassignment.
import { applyBeforeUnloadResult, type createEvents } from "./events.js";

type Events = ReturnType<typeof createEvents>;
type Target = InstanceType<Events["EventTarget"]>;
type Event = InstanceType<Events["Event"]>;
type Handler = (this: Target, event: Event) => unknown;
type Slot = { handler: Handler | null; source?: string; listener: Handler };

/** Creates the shared handler table for one Window and its elements. */
export function createEventHandlers(input: {
  compile: (target: Target, type: string, source: string) => Handler | null;
  invokeError?: (target: Target, handler: Handler, event: Event) => unknown;
}) {
  let targets: WeakMap<Target, Map<string, Slot>> | undefined;

  function get(target: Target, type: string): Handler | null {
    const slot = targets?.get(target)?.get(type);
    if (!slot) return null;
    if (slot.source !== undefined) {
      const source = slot.source;
      delete slot.source;
      slot.handler = input.compile(target, type, source);
    }
    return slot.handler;
  }

  function update(target: Target, type: string, handler: Handler | null, source?: string): void {
    let slots = targets?.get(target);
    const existing = slots?.get(type);
    if (handler === null && source === undefined) {
      if (existing) {
        target.removeEventListener(type, existing.listener);
        slots?.delete(type);
      }
      return;
    }
    if (existing) {
      existing.handler = handler;
      if (source === undefined) delete existing.source;
      else existing.source = source;
      return;
    }
    if (!slots) (targets ??= new WeakMap()).set(target, (slots = new Map()));
    const listener: Handler = (event) => {
      const handler = get(target, type);
      if (!handler) return;
      const result =
        type === "error" && input.invokeError
          ? input.invokeError(target, handler, event)
          : handler.call(target, event);
      if (type === "beforeunload") applyBeforeUnloadResult(event, result);
      else if (result === false) event.preventDefault();
    };
    slots.set(type, { handler, listener, ...(source === undefined ? {} : { source }) });
    target.addEventListener(type, listener);
  }

  return {
    get,
    set(target: Target, type: string, value: Handler | null): void {
      update(target, type, typeof value === "function" ? value : null);
    },
    attribute(target: Target, type: string, source: string | null): void {
      update(target, type, null, source ?? undefined);
    },
    has(target: Target, type: string): boolean {
      return targets?.get(target)?.has(type) ?? false;
    },
  };
}
