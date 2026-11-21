// Converts numeric and calendar input values and owns their shared step grid.
const day = 86_400_000;
const week = 7 * day;
const numericTypes = new Set([
  "number",
  "range",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
]);
const float = /^-?(?:[0-9]*\.[0-9]+|[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

export function supportsInputNumber(type: string): boolean {
  return numericTypes.has(type);
}

function dateAt(year: number, month: number, dayOfMonth: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, dayOfMonth);
  return date;
}

function dateValue(value: string): number {
  const match = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return NaN;
  const [year, month, dayOfMonth] = match.slice(1).map(Number);
  if (!year || !month || !dayOfMonth) return NaN;
  const date = dateAt(year, month, dayOfMonth);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === dayOfMonth
    ? date.getTime()
    : NaN;
}

function timeValue(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) return NaN;
  return (
    Number(match[1]) * 3_600_000 +
    Number(match[2]) * 60_000 +
    Number(match[3] ?? 0) * 1000 +
    Number((match[4] ?? "").padEnd(3, "0"))
  );
}

function firstWeek(year: number): number {
  const date = dateAt(year, 1, 4);
  return date.getTime() - ((date.getUTCDay() + 6) % 7) * day;
}

function monthValue(value: string): number {
  const match = /^(\d{4,})-(0[1-9]|1[0-2])$/.exec(value);
  const year = Number(match?.[1]);
  return year > 0 ? (year - 1970) * 12 + Number(match?.[2]) - 1 : NaN;
}

function weekValue(value: string): number {
  const match = /^(\d{4,})-W(0[1-9]|[1-4]\d|5[0-3])$/.exec(value);
  const year = Number(match?.[1]);
  if (!(year > 0)) return NaN;
  const start = firstWeek(year) + (Number(match?.[2]) - 1) * week;
  return start < firstWeek(year + 1) ? start : NaN;
}

/** Converts an input's serialized value to its HTML numeric representation. */
export function inputNumber(type: string, value: string): number {
  if (/[\r\n]$/.test(value)) return NaN;
  switch (type) {
    case "date":
      return dateValue(value);
    case "time":
      return timeValue(value);
    case "month":
      return monthValue(value);
    case "week":
      return weekValue(value);
    case "datetime-local": {
      const separator = value.search(/[T ]/);
      return separator < 0
        ? NaN
        : dateValue(value.slice(0, separator)) + timeValue(value.slice(separator + 1));
    }
    case "number":
    case "range": {
      const number = float.test(value) ? Number(value) : NaN;
      return Number.isFinite(number) ? number : NaN;
    }
    default:
      return NaN;
  }
}

/** Reports whether the input type supports Date objects as its IDL value. */
export function supportsInputDate(type: string): boolean {
  return type === "date" || type === "month" || type === "week" || type === "time";
}

/** Converts a calendar input to the timestamp of its UTC Date representation. */
export function inputDateTimestamp(type: string, value: string): number {
  const number = inputNumber(type, value);
  if (type !== "month" || !Number.isFinite(number)) return number;
  return dateAt(1970 + Math.floor(number / 12), (((number % 12) + 12) % 12) + 1, 1).getTime();
}

/** Serializes a Date using its UTC components, including calendar months before 1970. */
export function formatInputDate(type: string, timestamp: number): string {
  if (type !== "month" || !Number.isFinite(timestamp)) return formatInputNumber(type, timestamp);
  const date = new Date(timestamp);
  return formatInputNumber(type, (date.getUTCFullYear() - 1970) * 12 + date.getUTCMonth());
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

function formatTime(value: number): string {
  const withinDay = ((value % day) + day) % day;
  const iso = new Date(withinDay).toISOString().slice(11, 23);
  return iso.endsWith(":00.000") ? iso.slice(0, 5) : iso.replace(/\.?0+$/, "");
}

/** Serializes a numeric input value, or returns the empty value when outside its representation. */
export function formatInputNumber(type: string, value: number): string {
  if (!Number.isFinite(value)) return "";
  if (type === "number" || type === "range") return String(value);
  if (type === "time") return formatTime(value);
  if (type === "month") {
    const month = Math.trunc(value);
    const year = 1970 + Math.floor(month / 12);
    return year > 0 ? `${pad(year, 4)}-${pad((((month % 12) + 12) % 12) + 1)}` : "";
  }
  const date = new Date(value);
  const year = date.getUTCFullYear();
  if (!(year > 0)) return "";
  if (type === "week") {
    const monday = Math.floor(value / day) * day - ((date.getUTCDay() + 6) % 7) * day;
    const weekYear = new Date(monday + 3 * day).getUTCFullYear();
    return `${pad(weekYear, 4)}-W${pad(Math.floor((monday - firstWeek(weekYear)) / week) + 1)}`;
  }
  const formatted = `${pad(year, 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return type === "datetime-local" ? `${formatted}T${formatTime(value)}` : formatted;
}

type Grid = { min: number; max: number; base: number; step: number };

/** Parses the leading HTML floating-point number, or returns NaN if absent or invalid. */
export function floatingPrefix(value: string | null): number {
  return Number(value?.match(/^[\t\n\f\r ]*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/)?.[1]);
}

/** Resolves bounds and step settings from the input's content attributes. */
export function numericGrid(type: string, attribute: (name: string) => string | null): Grid {
  const parse = (value: string | null) =>
    type === "number" || type === "range" ? floatingPrefix(value) : inputNumber(type, value ?? "");
  const minimum = parse(attribute("min"));
  const maximum = parse(attribute("max"));
  const initial = parse(attribute("value"));
  const min = Number.isFinite(minimum) ? minimum : type === "range" ? 0 : -Infinity;
  const max = Number.isFinite(maximum) ? maximum : type === "range" ? 100 : Infinity;
  const base = Number.isFinite(minimum)
    ? minimum
    : Number.isFinite(initial)
      ? initial
      : type === "week"
        ? -3 * day
        : 0;
  const requested = attribute("step");
  const size = floatingPrefix(requested);
  const time = type === "time" || type === "datetime-local";
  const scale = time ? 1000 : type === "date" ? day : type === "week" ? week : 1;
  const step =
    requested?.toLowerCase() === "any"
      ? NaN
      : (size > 0 && Number.isFinite(size * scale) ? size : time ? 60 : 1) * scale;
  return { min, max, base, step };
}

type Decimal = { coefficient: bigint; exponent: number };

function decimal(value: number): Decimal {
  const [mantissa = "0", exponent = "0"] = String(value).split("e");
  const fraction = mantissa.split(".")[1]?.length ?? 0;
  return { coefficient: BigInt(mantissa.replace(".", "")), exponent: Number(exponent) - fraction };
}

function atExponent(value: Decimal, exponent: number): bigint {
  return value.coefficient * 10n ** BigInt(value.exponent - exponent);
}

function gridPosition(
  value: number,
  grid: Grid,
): { floor: bigint; remainder: bigint; divisor: bigint } {
  const current = decimal(value);
  const base = decimal(grid.base);
  const step = decimal(grid.step);
  const exponent = Math.min(current.exponent, base.exponent, step.exponent);
  const divisor = atExponent(step, exponent);
  const difference = atExponent(current, exponent) - atExponent(base, exponent);
  const remainder = ((difference % divisor) + divisor) % divisor;
  return { floor: (difference - remainder) / divisor, remainder, divisor };
}

function gridValue(position: bigint, grid: Grid): number {
  const base = decimal(grid.base);
  const step = decimal(grid.step);
  const exponent = Math.min(base.exponent, step.exponent);
  const coefficient = atExponent(base, exponent) + position * atExponent(step, exponent);
  return Number(`${coefficient}e${exponent}`);
}

function lowerPosition(value: number, grid: Grid): bigint {
  const { floor, remainder } = gridPosition(value, grid);
  return remainder === 0n ? floor : floor + 1n;
}

/** Checks step alignment in decimal space so very small steps retain their remainder. */
export function numericStepMismatch(value: number, grid: Grid): boolean {
  return (
    Number.isFinite(value) &&
    Number.isFinite(grid.step) &&
    gridPosition(value, grid).remainder !== 0n
  );
}

/** Clamps and rounds a range control, with ties moving toward positive infinity. */
export function sanitizeRange(value: string, grid: Grid): string {
  const parsed = inputNumber("range", value);
  const { min, max } = grid;
  if (max <= min) return String(min);
  const bounded = Math.max(min, Math.min(max, Number.isNaN(parsed) ? min / 2 + max / 2 : parsed));
  if (!Number.isFinite(grid.step)) return String(bounded);
  const { floor, remainder, divisor } = gridPosition(bounded, grid);
  if (remainder === 0n) return String(bounded);
  const lowest = lowerPosition(min, grid);
  const highest = gridPosition(max, grid).floor;
  if (lowest > highest) return String(bounded);
  const nearest = remainder * 2n >= divisor ? floor + 1n : floor;
  return String(gridValue(nearest < lowest ? lowest : nearest > highest ? highest : nearest, grid));
}

/** Computes the next aligned value. An undefined result leaves the control untouched. */
export function stepNumericValue(
  value: number,
  count: number,
  up: boolean,
  grid: Grid,
): number | undefined {
  const { min, max } = grid;
  const lowest = Number.isFinite(min) ? lowerPosition(min, grid) : undefined;
  const highest = Number.isFinite(max) ? gridPosition(max, grid).floor : undefined;
  if (lowest !== undefined && highest !== undefined && lowest > highest) return undefined;
  const original = Number.isNaN(value) ? 0 : value;
  const { floor, remainder } = gridPosition(original, grid);
  let next = remainder === 0n ? floor + BigInt(up ? count : -count) : up ? floor + 1n : floor;
  if (lowest !== undefined && next < lowest) next = lowest;
  if (highest !== undefined && next > highest) next = highest;
  const result = gridValue(next, grid);
  if (!Number.isFinite(result) || (up ? result < original : result > original)) return undefined;
  return result;
}
