import { type Infer, s } from "@halonicjs/schema-kit";
import { id, version } from "../../shared/fields.ts";

/**
 * `providers/<id>.yaml`: a connection to something that serves models.
 * Secrets are referenced by name, never stored in the file.
 */
export const Provider = s
  .object({
    version,
    id,
    name: s.string().optional(),
    /** Adapter type: anthropic, openai, openai-compatible, ollama, lmstudio, or mock (for tests). */
    type: s.string().min(1),
    baseUrl: s.string().url().optional(),
    /** The name of the secret that holds the API key. */
    secret: s.string().optional(),
    /** True when the provider runs on this machine or your own network. */
    local: s.boolean().default(false),
    /** Adapter-specific settings (account id, API version, headers, …). */
    options: s.record(s.string(), s.unknown()).default({}),
    /**
     * The model ids at this provider that search the web by themselves, such
     * as `perplexity/sonar`. Their searches happen at the provider, outside
     * Halonic's tools and approvals, so `halonic doctor` can warn when a
     * harness agent's alias names one. Matched exactly against an alias's `model`.
     */
    searchesWeb: s.array(s.string().min(1)).optional(),
  })
  .strict();

/** A model provider, with defaults filled in. */
export type Provider = Infer<typeof Provider>;
