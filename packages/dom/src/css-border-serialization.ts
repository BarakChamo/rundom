// Serializes physical border declarations from canonical component values and importance.
type Component = { value: string; priority: string };
type Entry = Component & { property: string };
const sides = ["top", "right", "bottom", "left"] as const;
const parts = ["width", "style", "color"] as const;
const wide = /^(?:inherit|initial|unset|revert(?:-layer|-rule)?)$/;

function combined(entries: readonly Component[], box = false): string {
  const first = entries[0];
  if (!first || entries.some((entry) => !entry.value || entry.priority !== first.priority))
    return "";
  const values = entries.map((entry) => entry.value);
  if (values.some((value) => wide.test(value)))
    return values.every((value) => value === first.value) ? first.value : "";
  if (values.some((value) => /var\(/i.test(value))) return "";
  if (box) {
    const [top, right, bottom, left] = values;
    if (top === right && top === bottom && top === left) return top ?? "";
    if (right === left) return top === bottom ? `${top} ${right}` : `${top} ${right} ${bottom}`;
    return values.join(" ");
  }
  return (
    values
      .filter((value, index) => value !== ["medium", "none", "currentcolor"][index])
      .join(" ") || "medium"
  );
}

/** Returns canonical physical-border entries; unrelated and unresolved declarations stay with the provider. */
export function serializePhysicalBorder(
  read: (property: string) => Component,
): readonly Entry[] | undefined {
  const components = new Map<string, Component>();
  for (const side of sides)
    for (const part of parts) {
      const property = `border-${side}-${part}`;
      const component = read(property);
      if (component.value) components.set(property, component);
    }
  if (!components.size) return undefined;
  const image = read("border-image");
  const values = [...components.values()];
  // Pending substitutions carry shorthand provenance which plain components cannot recover.
  if (values.some(({ value }) => /var\(/i.test(value))) return undefined;
  const first = values[0];
  if (!first) return undefined;
  const output: Entry[] = [];
  if (components.size === 12 && values.every((item) => item.priority === first.priority)) {
    const axes = parts.map((part) => sides.map((side) => read(`border-${side}-${part}`)));
    const uniform = axes.every((axis) => axis.every((item) => item.value === axis[0]?.value));
    const commonWide = wide.test(first.value) && values.every((item) => item.value === first.value);
    const border = combined(parts.map((part) => read(`border-top-${part}`)));
    if (
      commonWide ||
      (uniform && border && image.value === "none" && image.priority === first.priority)
    )
      return [
        { property: "border", value: commonWide ? first.value : border, priority: first.priority },
      ];
    if (axes.every((axis) => combined(axis, true))) {
      for (const [index, part] of parts.entries()) {
        const axis = axes[index];
        if (axis)
          output.push({
            property: `border-${part}`,
            value: combined(axis, true),
            priority: first.priority,
          });
      }
      if (image.value) output.push({ property: "border-image", ...image });
      return output;
    }
  }
  // An independently complete width/style/color axis remains a box shorthand.
  for (const part of parts) {
    const names = sides.map((side) => `border-${side}-${part}`);
    const axis = names.map((name) => read(name));
    const value = combined(axis, true);
    if (!value || names.some((name) => !components.has(name))) continue;
    output.push({ property: `border-${part}`, value, priority: axis[0]?.priority ?? "" });
    for (const name of names) components.delete(name);
  }
  // Without a full axis, preserve side shorthands and each component's own priority.
  for (const priority of ["", "important"]) {
    for (const side of sides) {
      const entries = parts.map(
        (part) => components.get(`border-${side}-${part}`) ?? { value: "", priority: "" },
      );
      const sideValue = combined(entries);
      if (sideValue && entries[0]?.priority === priority) {
        output.push({ property: `border-${side}`, value: sideValue, priority });
      } else
        for (const part of parts) {
          const property = `border-${side}-${part}`,
            component = components.get(property);
          if (component?.priority === priority) output.push({ property, ...component });
        }
    }
    if (image.value && image.priority === priority)
      output.push({ property: "border-image", ...image });
  }
  return output;
}

/** Identifies only the physical family; logical borders and border-image longhands remain independent. */
export function isPhysicalBorder(property: string): boolean {
  return /^(?:border|border-(?:width|style|color|image)|border-(?:top|right|bottom|left)(?:-(?:width|style|color))?)$/.test(
    property,
  );
}
