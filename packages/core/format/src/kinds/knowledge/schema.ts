import { type Infer, s } from "@halonicjs/schema-kit";
import { id, version } from "../../shared/fields.ts";

/** `library/knowledge/<id>.yaml`: a source agents can search. */
export const KnowledgeSource = s
  .object({
    version,
    id,
    name: s.string().optional(),
    description: s.string().optional(),
    /** What the source covers, written or approved by a person. Agents see it in their prompt. */
    summary: s.string().optional(),
    /**
     * `tools` (the default): agents search when they decide to. `auto`: the
     * task text is also searched before the first model call and the top
     * passages go into the prompt.
     */
    mode: s.enum(["tools", "auto"]).optional(),
    /** Knowledge provider type, such as files, mcp or vector. */
    provider: s.string().min(1),
    /** Files only: agents that list the source may also write notes to it. */
    writable: s.boolean().optional(),
    /** Settings the knowledge provider checks against its own schema. */
    config: s.record(s.string(), s.unknown()).default({}),
  })
  .strict();

/** A knowledge source, with defaults filled in. */
export type KnowledgeSource = Infer<typeof KnowledgeSource>;
