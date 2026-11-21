// Shares private custom-element state between setlike wrappers and live CSS predicates.
const elementValues = new WeakMap<object, Set<string>>();
const stateSets = new WeakMap<object, { readonly target: object; readonly values: Set<string> }>();
const has = Set.prototype.has;

/** Associates a Window-local state-set wrapper with its element and canonical values. */
export function initializeCustomStates(handle: object, target: object, values: Set<string>): void {
  const canonical = elementValues.get(target) ?? values;
  elementValues.set(target, canonical);
  stateSets.set(handle, { target, values: canonical });
}

/** Reads branded setlike receiver state across Window method borrowing. */
export function customStateValues(handle: object): Set<string> {
  const record = stateSets.get(handle);
  if (!record) throw new TypeError("Expected a CustomStateSet");
  return record.values;
}

/** Matches current private state without depending on DOM revisions or public properties. */
export function hasCustomState(target: object, name: string): boolean {
  const values = elementValues.get(target);
  return values !== undefined && Reflect.apply(has, values, [name]);
}
