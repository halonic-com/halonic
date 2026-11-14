import { checkOutsideRunCall, type OutsideRunCall } from "@halonicjs/app";
import type { ConnectorCallPorts, ServerPorts } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { isJsonRequest } from "./run-routes.ts";
import { refuseUnlessTrusted } from "./trust-routes.ts";

/** `POST /api/connector-calls`: one connector tool call from outside a run. */
export const connectorCallPath = "/api/connector-calls";

export interface ConnectorRoutes {
  /**
   * Runs one connector tool for a caller that isn't a run, but only when the
   * outside-a-run gate says "run". Everything else is refused or fails
   * without the tool running.
   */
  call(request: Request, body: Uint8Array): Promise<Response>;
}

type Target = Omit<OutsideRunCall, "args">;

type ConnectorRoutePorts = Pick<ServerPorts, "connectors" | "trust" | "errorLog">;

/** The longest connector id or tool name the route accepts, in UTF-8 bytes. */
const maxNameBytes = 256;

/** A connector id or tool name is caller text: the host looks it up in its own list and never reads it as a path. */
function isName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    new TextEncoder().encode(value).length <= maxNameBytes
  );
}

function isFields(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The call the body asks for, or `null` when the body isn't one. An unknown key refuses it. */
function parseCall(body: Uint8Array) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
  if (!isFields(parsed) || Object.keys(parsed).some((key) => !callKeys.includes(key))) return null;
  const { connector, tool, arguments: args } = parsed;
  return isName(connector) && isName(tool) && isFields(args) ? { connector, tool, args } : null;
}

const callKeys = ["connector", "tool", "arguments"];

/** The refusal a caller sees. The reason is the gate's own text; the store's error stays out of it. */
function refusal(reason: string): Response {
  const { status, code } = serverErrors.connectorCallRefused;
  return Response.json({ code, message: reason }, { status });
}

export function createConnectorRoutes({
  connectors,
  trust,
  errorLog,
}: ConnectorRoutePorts): ConnectorRoutes {
  /** The call to make, or the response that refuses it before the host is asked anything. */
  async function accept(request: Request, body: Uint8Array) {
    if (!isJsonRequest(request)) return errorResponse(serverErrors.unsupportedMediaType);
    const parsed = parseCall(body);
    if (parsed === null) return errorResponse(serverErrors.badRequest);
    // A connector is a program the workspace starts, so a call needs trust just like a start.
    return (await refuseUnlessTrusted(trust)) ?? parsed;
  }

  /** Runs a call the gate let through. A failure answers a fixed text; the cause goes to the log. */
  async function run(
    port: ConnectorCallPorts,
    request: Request,
    target: Target,
    args: unknown,
  ): Promise<Response> {
    try {
      return Response.json({ result: await port.call(target, args, request.signal) });
    } catch (error) {
      if (request.signal.aborted) return errorResponse(serverErrors.requestAborted);
      errorLog.record(error);
      return errorResponse(serverErrors.connectorCallFailed);
    }
  }

  return {
    async call(request, body) {
      if (connectors === undefined) return errorResponse(serverErrors.notFound);
      const parsed = await accept(request, body);
      if (parsed instanceof Response) return parsed;
      const target = await connectors.find(parsed.connector, parsed.tool);
      if (target === null) return errorResponse(serverErrors.connectorToolNotFound);
      // The gate sits here, not in the port, so no host can offer a call that skips it.
      const check = await checkOutsideRunCall(
        { ...target, args: parsed.args },
        connectors.settings,
      );
      if (check.kind === "refused") {
        if (check.error !== undefined) errorLog.record(check.error);
        return refusal(check.reason);
      }
      return run(connectors, request, target, parsed.args);
    },
  };
}
