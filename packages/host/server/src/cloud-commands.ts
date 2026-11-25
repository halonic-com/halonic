import type { Clock } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import type {
  CloudCommand,
  CloudCommandHandler,
  CloudCommandProgress,
  CloudCommandWork,
  CloudInboxPorts,
} from "./cloud-inbox-api.ts";
import { productStateHandler } from "./cloud-product-state.ts";
import { errorResponse, serverErrors } from "./errors.ts";

/** Where Halonic Cloud posts every command. */
export const cloudCommandsPath = "/api/cloud/commands";

/** A command id: 1 to 128 printable ASCII characters. */
const commandIdPattern = /^[\x21-\x7E]{1,128}$/;

const commandFields = ["id", "kind", "sequence", "payload"];

/** The route for Cloud's commands. */
export interface CloudCommandRoute {
  /** Answers one `POST` to {@link cloudCommandsPath}, with the body the server already read. */
  answer(request: Request, body: Uint8Array): Promise<Response>;
}

/** A valid command Cloud signed, ready to claim and run. */
interface PreparedCommand {
  readonly command: CloudCommand;
  readonly handler: CloudCommandHandler;
  readonly work: CloudCommandWork;
}

/**
 * The handlers by kind: the server's own `product.state` and the host's.
 *
 * @throws RangeError when two handlers carry out the same kind
 */
function handlersByKind(ports: CloudInboxPorts): ReadonlyMap<string, CloudCommandHandler> {
  const byKind = new Map<string, CloudCommandHandler>();
  for (const handler of [productStateHandler(ports.link), ...ports.handlers]) {
    if (byKind.has(handler.kind)) {
      throw new RangeError(`two Cloud command handlers carry out ${handler.kind}`);
    }
    byKind.set(handler.kind, handler);
  }
  return byKind;
}

/**
 * Builds the route for Cloud's commands. A command is carried out only when Cloud signed it
 * (the host's check, which also refuses a nonce it has seen), its signed id is the body's id, its
 * kind is known and its payload is valid. Then the ledger decides: a finished id answers 200
 * without acting again, an id another try is running answers 409, and only a try that claims the
 * id runs the work. Anything but 2xx makes Cloud try again with the same id.
 *
 * @throws RangeError when two handlers carry out the same kind
 */
export function createCloudCommandRoute(ports: CloudInboxPorts, clock: Clock): CloudCommandRoute {
  const handlers = handlersByKind(ports);

  /** The command with its handler and work, or the refusal when Cloud didn't sign it or it isn't valid. */
  async function prepare(request: Request, body: Uint8Array): Promise<PreparedCommand | Response> {
    const { method, url, headers } = request;
    const verified = await ports.verify({ method, url, headers, body });
    if (verified === null) return errorResponse(serverErrors.cloudNotSigned);
    const command = parseCommand(body);
    if (command === null || command.id !== verified.commandId) {
      return errorResponse(serverErrors.badRequest);
    }
    const handler = handlers.get(command.kind);
    const work = handler?.prepare(command) ?? null;
    if (handler === undefined || work === null) return errorResponse(serverErrors.badRequest);
    return { command, handler, work };
  }

  return {
    async answer(request, body) {
      const prepared = await prepare(request, body);
      if (prepared instanceof Response) return prepared;
      const { command, handler, work } = prepared;
      const claim = crypto.randomUUID();
      const now = clock.now();
      const leaseUntil = new Date(now.getTime() + handler.leaseMs);
      const claimed = await ports.commands.claim(command.id, claim, now, leaseUntil);
      if (claimed === "done") return commandDone();
      if (claimed === "running") return errorResponse(serverErrors.cloudCommandRunning);
      let progress: CloudCommandProgress;
      try {
        progress = await work();
      } catch (error) {
        await ports.commands.release(command.id, claim);
        throw error;
      }
      // A command still going keeps its claim until the lease runs out; a later try then resumes it.
      if (progress === "pending") return errorResponse(serverErrors.cloudCommandRunning);
      await ports.commands.finish(command.id, claim);
      return commandDone();
    },
  };
}

function commandDone(): Response {
  return Response.json({ command: "done" }, { headers: { "cache-control": "no-store" } });
}

/** The body as a command, or `null` unless it is JSON with exactly the four fields, each valid. */
function parseCommand(body: Uint8Array): CloudCommand | null {
  const value = parseJson(body);
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== commandFields.length || !commandFields.every((key) => keys.includes(key))) {
    return null;
  }
  const { id, kind, sequence, payload } = value;
  if (typeof id !== "string" || !commandIdPattern.test(id)) return null;
  if (typeof kind !== "string" || kind === "") return null;
  if (sequence !== null && typeof sequence !== "number") return null;
  if (!isPlainObject(payload)) return null;
  return { id, kind, sequence, payload };
}

function parseJson(body: Uint8Array): unknown {
  try {
    // `ignoreBOM: true` keeps a leading byte-order mark in the text, so `JSON.parse` refuses it.
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body));
  } catch (error) {
    // Not UTF-8 or not JSON: a malformed body, answered as one.
    if (error instanceof SyntaxError || error instanceof TypeError) return undefined;
    throw error;
  }
}
