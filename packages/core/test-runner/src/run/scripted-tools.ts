// Connectors whose tools answer from a test case's script: tests never reach
// a real server.

import { approveAll, type Connector, needsApproval } from "@halonicjs/format";
import type { ConnectorClient, ConnectorTool } from "@halonicjs/ports";
import type { TestFailure } from "../test-result.ts";

/**
 * The scripted results of one test case, keyed `<connector>.<tool>`, and
 * fake connectors that hand them out in order. A call is matched by its
 * key only, never by its arguments.
 */
export class ScriptedTools {
  readonly #queues: Map<string, string[]>;
  /** The keys called with no result left, in the order of their first call. */
  readonly #unscripted = new Set<string>();

  constructor(script: Readonly<Record<string, readonly string[]>>) {
    this.#queues = new Map(Object.entries(script).map(([key, results]) => [key, [...results]]));
  }

  /**
   * A fake client per connector. It lists the connector's allowed and
   * approved tools and every scripted one. A tool the connector's
   * `tools.approve` names asks a person first, as it would in a real run;
   * the others only read, so they run inside the model's turn.
   */
  clients(connectors: Readonly<Record<string, Connector>>): ConnectorClient[] {
    return Object.entries(connectors).map(([id, connector]) => this.#client(id, connector));
  }

  /** What the case's runs did wrong with the script: unscripted calls, then unused results. */
  failures(): TestFailure[] {
    const failures: TestFailure[] = [...this.#unscripted].map((tool) => ({
      kind: "unscripted-tool",
      tool,
    }));
    for (const [tool, left] of this.#queues) {
      if (left.length > 0) failures.push({ kind: "unused-tool-results", tool, count: left.length });
    }
    return failures;
  }

  #client(id: string, connector: Connector): ConnectorClient {
    const { allow = [], approve } = connector.tools;
    // Connector ids hold no dots, so `<id>.` never matches another connector's keys.
    const scripted = [...this.#queues.keys()]
      .filter((key) => key.startsWith(`${id}.`))
      .map((key) => key.slice(id.length + 1));
    const names = [...new Set([...allow, ...(approve === approveAll ? [] : approve), ...scripted])];
    const tools: ConnectorTool[] = names.map((name) => ({
      name,
      description: `${name} (scripted)`,
      parameters: { type: "object", additionalProperties: true },
      risk: needsApproval(connector.tools, name) ? "write" : "read",
    }));
    return {
      id,
      listTools: async () => tools.map((tool) => ({ ...tool })),
      callTool: async (name) => this.#next(`${id}.${name}`),
      close: async () => {},
    };
  }

  #next(key: string): string {
    const result = this.#queues.get(key)?.shift();
    if (result === undefined) {
      this.#unscripted.add(key);
      throw new Error(`No scripted result for ${key}.`);
    }
    return result;
  }
}
