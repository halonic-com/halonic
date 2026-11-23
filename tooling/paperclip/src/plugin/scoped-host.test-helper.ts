import { AsyncLocalStorage } from "node:async_hooks";
import {
  JsonRpcCallError,
  PLUGIN_RPC_ERROR_CODES,
  type PluginEvent,
} from "@paperclipai/plugin-sdk";

/** The clients the host gates; `logger` is a notification and passes ungated, as on the host. */
const gatedClients = [
  "companies",
  "config",
  "secrets",
  "http",
  "metrics",
  "state",
  "issues",
  "agents",
  "events",
] as const;

/**
 * Calls whose params never carry a company: the SDK sends `companies.list`
 * paging only, `http.fetch` a URL, and `metrics.write` its tags nested.
 */
const namesNoCompany = new Set(["companies.list", "http.fetch", "metrics.write"]);

/** The company a call names, the way the host reads it from the call's params. */
function namedCompany(args: readonly unknown[], companies: ReadonlySet<string>): string | null {
  for (const arg of args) {
    if (typeof arg === "string" && companies.has(arg)) {
      return arg;
    }
    if (typeof arg === "object" && arg !== null) {
      const record = arg as Record<string, unknown>;
      if (typeof record["companyId"] === "string") {
        return record["companyId"];
      }
      if (record["scopeKind"] === "company" && typeof record["scopeId"] === "string") {
        return record["scopeId"];
      }
    }
  }
  return null;
}

function refusal(method: string): JsonRpcCallError {
  return new JsonRpcCallError({
    code: PLUGIN_RPC_ERROR_CODES.INVOCATION_SCOPE_DENIED,
    message: `Plugin is not allowed to perform "${method}": the worker referenced a missing, expired, or unknown invocation scope`,
  });
}

/**
 * Wraps a fake plugin context in the host's invocation-scope rule
 * (Paperclip 2026.1117.0, `contextForWorkerMessage`):
 * - a call inside a delivered event carries that event's company scope;
 * - a call outside one is proactive: admitted when it names a configured
 *   company, refused when it names none while any event is in flight;
 * - `companies.list`, `http.fetch` and `metrics.write` never name a company.
 * Like the host's 15-minute TTL, a delivered event stays in flight for the
 * rest of the test. `companies.list` answers the configured companies, and
 * `events.emit` delivers the plugin's own event back under its company's scope.
 */
export function withScopeRule(ctx: object, configured: readonly string[]) {
  const companies = new Set(configured);
  const scope = new AsyncLocalStorage<{ companyId: string }>();
  const handlers = new Map<string, (event: PluginEvent) => Promise<void>>();
  let inFlight = 0;

  function admit(method: string, args: readonly unknown[]): void {
    const named = namesNoCompany.has(method) ? null : namedCompany(args, companies);
    const current = scope.getStore();
    if (current !== undefined) {
      if (named !== null && named !== current.companyId) {
        throw refusal(method);
      }
      return;
    }
    if (named !== null && companies.has(named)) {
      return;
    }
    if (inFlight > 0) {
      throw refusal(method);
    }
  }

  /** Delivers an event as the host does: in flight from now on, its handler in its company's scope. */
  async function deliver(eventType: string, companyId: string): Promise<void> {
    inFlight += 1;
    const handler = handlers.get(eventType);
    const event = { eventType, companyId, payload: {} } as unknown as PluginEvent;
    await scope.run({ companyId }, async () => handler?.(event));
  }

  const own = {
    companies: { list: async () => configured.map((id) => ({ id })) },
    events: {
      on: (name: string, handler: (event: PluginEvent) => Promise<void>) => {
        handlers.set(name, handler);
        return () => handlers.delete(name);
      },
      emit: async (name: string, companyId: string) => {
        await deliver(`plugin.halonic.agent-tools.${name}`, companyId);
      },
    },
  };
  const base = { ...ctx, ...own } as Record<string, unknown>;
  const gated: Record<string, unknown> = { ...base };
  for (const client of gatedClients) {
    gated[client] = gate(base[client], client, admit);
  }
  return { ctx: gated, deliver };
}

/** A copy of `target` whose every method, nested ones included, first passes `admit`. */
function gate(
  target: unknown,
  path: string,
  admit: (method: string, args: readonly unknown[]) => void,
): unknown {
  if (typeof target !== "object" || target === null) {
    return target;
  }
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(target)) {
    const method = `${path}.${key}`;
    copy[key] =
      typeof value === "function"
        ? (...args: unknown[]) => {
            admit(method, args);
            return value(...args);
          }
        : gate(value, method, admit);
  }
  return copy;
}
