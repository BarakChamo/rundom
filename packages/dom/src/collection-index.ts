// Recognizes canonical Web IDL indexed names without treating ordinary expandos as indices.
export function indexedProperty(key: PropertyKey): number | undefined {
  if (typeof key !== "string" || key.length === 0 || key.length > 10) return undefined;
  const first = key.charCodeAt(0);
  if (first < 48 || first > 57) return undefined;
  if (key.length === 1) return first - 48;
  if (first === 48) return undefined;
  let index = first - 48;
  // A canonical unsigned index has at most ten ASCII digits.
  for (let offset = 1; offset < key.length; offset++) {
    const digit = key.charCodeAt(offset) - 48;
    if (digit < 0 || digit > 9) return undefined;
    index = index * 10 + digit;
  }
  return index < 0xffffffff ? index : undefined;
}
