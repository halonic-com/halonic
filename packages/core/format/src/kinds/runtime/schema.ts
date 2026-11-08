import { type Infer, s } from "@halonicjs/schema-kit";
import { id, version } from "../../shared/fields.ts";

/** `runtimes/<id>.yaml`: where agents run. */
export const Runtime = s
  .object({
    version,
    id,
    /** Adapter type, such as inprocess, flue, cloudflare or rust. */
    type: s.string().min(1),
    options: s.record(s.string(), s.unknown()).default({}),
  })
  .strict();

/** A runtime, with defaults filled in. */
export type Runtime = Infer<typeof Runtime>;
