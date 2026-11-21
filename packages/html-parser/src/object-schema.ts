// Selects Zod's object interpreter without changing shared configuration or compiling validators at runtime.
import * as core from "zod/v4/core";
import { z } from "zod";
type ObjectOutput<Shape extends core.$ZodShape> = core.output<core.$ZodObject<Shape, core.$strip>>;

// The core constructor intentionally erases its shape parameter; this typed
// extension keeps the shape supplied to that same interpreter as its output contract.
class InterpretedObject<Shape extends core.$ZodShape> extends core.$ZodObject {
  declare _zod: core.$ZodObjectInternals<Shape, core.$strip>;
  constructor(definition: core.$ZodObjectDef<Shape>) {
    super(definition);
  }
}

/** Creates an interpreted object schema with the package's non-throwing parsing port.
 * Unknown keys reject by default; addon export objects may explicitly strip unrelated exports.
 */
export function objectSchema<Shape extends core.$ZodShape>(
  shape: Shape,
  options: { stripUnknown?: boolean; checks?: core.$ZodCheck<ObjectOutput<Shape>>[] } = {},
) {
  const schema = new InterpretedObject<Shape>({
    type: "object",
    shape,
    ...(options.stripUnknown ? {} : { catchall: z.never() }),
    ...(options.checks ? { checks: options.checks } : {}),
  });
  return Object.assign(schema, { safeParse: (input: unknown) => core.safeParse(schema, input) });
}
