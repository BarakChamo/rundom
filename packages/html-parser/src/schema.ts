// Validates the versioned native snapshot and its ownership graph before private DOM allocation.
import { objectSchema } from "./object-schema.js";
import { z } from "zod";
import { snapshotOwnershipIssues } from "./snapshot-ownership.js";
const index = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const record = objectSchema({
  kind: z.enum(["document", "fragment", "element", "text", "comment", "doctype"]),
  name: z.string(),
  namespace: z.enum([
    "",
    "http://www.w3.org/1999/xhtml",
    "http://www.w3.org/2000/svg",
    "http://www.w3.org/1998/Math/MathML",
  ]),
  text: z.string(),
  public_id: z.string(),
  system_id: z.string(),
  attrs: z.array(z.tuple([z.string(), z.string(), z.string(), z.string()])),
  children: z.array(index),
  template: index.nullable(),
  form: index.nullable(),
});
/** The complete version-one arena contract, including detached parser allocations. */
const snapshotDataSchema = objectSchema({
  version: z.literal(1),
  mode: z.enum(["quirks", "limited-quirks", "no-quirks"]),
  nodes: z.array(record).min(1),
});

/** Parsed snapshot type derived from the wire schema. */
export type HTMLSnapshot = z.infer<typeof snapshotDataSchema>;
/** Parses object snapshots through the same semantic authority as compact native snapshots. */
export const htmlSnapshotSchema = objectSchema(snapshotDataSchema._zod.def.shape, {
  checks: [
    z.check<HTMLSnapshot>((context) => {
      for (const message of snapshotOwnershipIssues(context.value))
        context.issues.push({ code: "custom", message, input: context.value });
    }),
  ],
});
/** Public input contract; coercion cannot repair unsupported input. */
export const parseHTMLRequestSchema = objectSchema({
  markup: z
    .string()
    .refine(
      (value) => value.isWellFormed(),
      "Native UTF-8 input cannot preserve unpaired UTF-16 surrogates",
    ),
  scriptingEnabled: z.boolean(),
});
