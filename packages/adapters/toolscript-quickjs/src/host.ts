import {
  type ToolScriptAudience,
  type ToolScriptHost,
  type ToolScriptLimits,
  toolScriptDefaultLimits,
} from "@halonicjs/ports";
import { createToolScriptHost } from "@halonicjs/toolscript-host";
import { createQuickJsToolScriptIsolate } from "./isolate.ts";

/** Options for {@link createQuickJsToolScriptHost}. */
export interface QuickJsToolScriptHostOptions {
  /** The one audience the host runs (ADR "Halonic ToolScript", S4). */
  readonly audience: ToolScriptAudience;
  /** The host's limits; the audience's defaults of ADR 2.3 when left out. */
  readonly limits?: ToolScriptLimits;
  /** What `ctx.now()` answers; the wall clock when left out. */
  readonly now?: () => string;
}

/**
 * A `ToolScriptHost` on QuickJS: `@halonicjs/toolscript-host`'s `ctx` host
 * (audience, secret fields, `touches`, frozen writes, batches, previews)
 * over a fresh QuickJS isolate per run, with the platform's SHA-256 and
 * secure randomness. It runs on any runtime with WebAssembly and Web Crypto.
 *
 * @example
 * const host = createQuickJsToolScriptHost({ audience: "user" });
 * const result = await host.run({ runId, artifact, registry, input, confirm });
 */
export function createQuickJsToolScriptHost(options: QuickJsToolScriptHostOptions): ToolScriptHost {
  const limits = options.limits ?? toolScriptDefaultLimits[options.audience];
  return createToolScriptHost({
    audience: options.audience,
    limits,
    isolate: createQuickJsToolScriptIsolate({ limits }),
    digest: {
      sha256: async (data) =>
        new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))),
    },
    randomBytes: (count) => crypto.getRandomValues(new Uint8Array(count)),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}
