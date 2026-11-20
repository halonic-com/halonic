// One connector for every part of a trusted plugin, as `app.plugin-connector`
// asks (plugins ADR, section 1.4). A workspace names a plugin once, as
// `transport: { plugin: { id } }`, and the run gets the tools of its backend
// and of each local tool through that one connector. Tool names are unique
// across a plugin's parts, so each call goes to the part that declares the
// tool. A part that can't start leaves out only its own tools and is
// reported once, with a code Studio and the CLI word; the other parts keep
// working.

import type {
  ConnectorCallOptions,
  ConnectorClient,
  ConnectorPartOff,
  ConnectorTool,
} from "@halonicjs/ports";
import { PluginBackendNotTrustedError, type PluginBackendTrustReason } from "./plugin-backend.ts";
import { LocalToolSettingsNotSetError } from "./plugin-local-tool-config.ts";
import {
  type LocalToolUnavailable,
  LocalToolUnavailableError,
  PluginLocalToolNotTrustedError,
} from "./plugin-local-tools.ts";
import type { PluginPart } from "./plugin-trust-content.ts";

/** One part of a plugin behind its connector: its backend or one local tool. */
export interface PluginConnectorPart {
  readonly part: PluginPart;
  /** The names of the tools the part declares in the manifest; only these are offered. */
  readonly declared: readonly string[];
  /** The part's own connector; nothing opens until its first use. */
  readonly client: ConnectorClient;
}

/**
 * Why a part of a plugin offers no tools.
 *
 * - A {@link LocalToolUnavailable} state, for a local tool this computer can't run.
 * - `settings-not-set`: a required setting the part takes has no value.
 * - `not-trusted`: the person's trust doesn't cover the plugin as it is now.
 * - `failed`: anything else; `error` on the report says what.
 */
export type PluginPartUnavailableReason =
  | LocalToolUnavailable
  | { readonly kind: "settings-not-set"; readonly settings: readonly string[] }
  | { readonly kind: "not-trusted"; readonly reason: PluginBackendTrustReason }
  | { readonly kind: "failed" };

/** A part of a plugin that can't start, as {@link PluginConnectorOptions.onUnavailable} is told. */
export interface PluginPartUnavailable {
  /** The plugin's id. */
  readonly plugin: string;
  readonly part: PluginPart;
  readonly reason: PluginPartUnavailableReason;
  /** The error the part failed with, for a log. */
  readonly error: unknown;
}

/** What {@link PluginConnector} joins. */
export interface PluginConnectorOptions {
  /** The connector's id in the workspace. */
  readonly id: string;
  /** The plugin's id. */
  readonly plugin: string;
  /** The plugin's parts that declare tools: the backend first, then the local tools in manifest order. */
  readonly parts: readonly PluginConnectorPart[];
  /** Told once for each part that can't start, when its listing or a call finds out. */
  onUnavailable?(unavailable: PluginPartUnavailable): void;
}

/**
 * The connector of a trusted plugin: the tools of all its parts, each call
 * sent to the part that declares the tool.
 *
 * @example
 * const connector = new PluginConnector({
 *   id: "weather", plugin: "weather",
 *   parts: [{ part: "backend", declared: ["forecast"], client: backend }],
 *   onUnavailable: (unavailable) => log(unavailable),
 * });
 */
export class PluginConnector implements ConnectorClient {
  readonly id: string;
  readonly #options: PluginConnectorOptions;
  /** The parts already reported, so each is told only once. */
  readonly #reported = new Set<PluginPart>();
  /** The parts reported since the last {@link newPartsOff}, for the run's log. */
  #partsOff: ConnectorPartOff[] = [];

  constructor(options: PluginConnectorOptions) {
    this.id = options.id;
    this.#options = options;
  }

  /**
   * The declared tools of every part that starts. A part that can't is
   * reported and left out.
   *
   * @throws the first part's error when no part starts, so the run refuses
   *   the connector as it would any other that can't be reached
   */
  async listTools(): Promise<ConnectorTool[]> {
    const { parts } = this.#options;
    const listed = await Promise.allSettled(parts.map((part) => part.client.listTools()));
    const tools: ConnectorTool[] = [];
    const errors: unknown[] = [];
    for (const [index, part] of parts.entries()) {
      const result = listed[index];
      if (result?.status === "fulfilled") {
        tools.push(...result.value.filter((tool) => part.declared.includes(tool.name)));
      } else if (result?.status === "rejected") {
        errors.push(result.reason);
        this.#report(part, result.reason);
      }
    }
    if (errors.length > 0 && errors.length === parts.length) throw errors[0];
    return tools;
  }

  /**
   * Calls the tool on the part that declares it. A call that finds its part
   * can't start reports it, unless it was reported already.
   *
   * @throws when no part declares `name`, or as the part's own call throws
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    options?: ConnectorCallOptions,
  ): Promise<string> {
    const part = this.#options.parts.find((candidate) => candidate.declared.includes(name));
    if (part === undefined) {
      throw new Error(`The plugin ${this.#options.plugin} declares no tool "${name}".`);
    }
    try {
      return await part.client.callTool(name, args, options);
    } catch (error) {
      if (pluginPartUnavailableReason(error).kind !== "failed") this.#report(part, error);
      throw error;
    }
  }

  /**
   * The parts reported since the last call, each once, with the code of why
   * (requirement `app.plugin-connector-parts-off`), so the run's log can say
   * which of the plugin's tools are off.
   */
  newPartsOff(): readonly ConnectorPartOff[] {
    const partsOff = this.#partsOff;
    this.#partsOff = [];
    return partsOff;
  }

  /** Closes every part, even when one of them fails to close. */
  async close(): Promise<void> {
    const closed = await Promise.allSettled(this.#options.parts.map((part) => part.client.close()));
    const failed = closed.find((result) => result.status === "rejected");
    if (failed !== undefined) throw failed.reason;
  }

  #report(part: PluginConnectorPart, error: unknown): void {
    if (this.#reported.has(part.part)) return;
    this.#reported.add(part.part);
    const { plugin, onUnavailable } = this.#options;
    const reason = pluginPartUnavailableReason(error);
    this.#partsOff.push({ part: part.part, reason: reason.kind });
    onUnavailable?.({ plugin, part: part.part, reason, error });
  }
}

/**
 * The code for why a part failed to start, from the errors Halonic's own
 * parts throw, also when one is the `cause` of the error a connector wrapped
 * it in.
 */
export function pluginPartUnavailableReason(error: unknown): PluginPartUnavailableReason {
  const known = knownCause(error);
  return known === undefined ? { kind: "failed" } : reasonOf(known);
}

type KnownError =
  | LocalToolUnavailableError
  | LocalToolSettingsNotSetError
  | PluginLocalToolNotTrustedError
  | PluginBackendNotTrustedError;

/** The first error in `error`'s chain of causes that Halonic's own parts throw. */
function knownCause(error: unknown): KnownError | undefined {
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    if (
      current instanceof LocalToolUnavailableError ||
      current instanceof LocalToolSettingsNotSetError ||
      current instanceof PluginLocalToolNotTrustedError ||
      current instanceof PluginBackendNotTrustedError
    ) {
      return current;
    }
    seen.add(current);
    current = current.cause;
  }
  return undefined;
}

function reasonOf(error: KnownError): PluginPartUnavailableReason {
  if (error instanceof LocalToolUnavailableError) return error.state;
  if (error instanceof LocalToolSettingsNotSetError) {
    return { kind: "settings-not-set", settings: error.settings };
  }
  return { kind: "not-trusted", reason: error.reason };
}
