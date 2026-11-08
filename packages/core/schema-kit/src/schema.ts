import type { z } from "zod";

/**
 * A schema that checks an input and produces a value of type `Output`.
 * `Input` is what a file may contain: keys with a default may be left out.
 * Build one with `s`; give a recursive schema this type explicitly:
 * `const Guard: Schema<Guard> = s.lazy(() => …)`.
 */
export type Schema<Output = unknown, Input = Output> = z.ZodType<Output, Input>;

/** The value a schema produces, with defaults filled in. Like `z.infer`. */
export type Infer<S extends Schema> = z.output<S>;

/** What a schema accepts: keys with a default are optional here. Like `z.input`. */
export type InferInput<S extends Schema> = z.input<S>;
