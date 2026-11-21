import { ControlPipeFault } from "./control-frames.ts";
import type { BrokerAnswer, RefusalReason, ShellMessage } from "./control-messages.ts";

/** A frame's object, as far as any shell message has fields. */
interface Fields {
  readonly kind?: unknown;
  readonly id?: unknown;
  readonly result?: unknown;
  readonly value?: unknown;
  readonly origins?: unknown;
  readonly reason?: unknown;
  readonly connection?: unknown;
}

/** The fields each kind has, besides `kind`: a frame with any other field is refused. */
const fieldsOf: Record<ShellMessage["kind"], readonly string[]> = {
  sandbox_host: ["connection"],
  stop: [],
  secret_answer: ["id", "result"],
};

/** The fields a `secret_answer` has for each broker result, besides `kind`, `id` and `result`. */
const answerFieldsOf: Record<BrokerAnswer["result"], readonly string[]> = {
  value: ["value"],
  origins: ["origins"],
  refused: ["reason"],
};

const refusalReasons: ReadonlySet<string> = new Set<RefusalReason>([
  "invalid_name",
  "reserved_name",
  "untrusted",
  "busy",
  "unavailable",
  "denied",
  "unreadable",
  "failed",
]);

/**
 * A frame's value as one of the shell's messages, checked as strictly as the
 * shell checks the engine's: a closed set of kinds, exactly their fields, each
 * of its type.
 *
 * @throws {ControlPipeFault} for anything else; its message names no value
 */
export function parseShellMessage(value: unknown): ShellMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw fault("isn't an object");
  }
  const fields = value as Fields;
  const kind = fields.kind;
  if (typeof kind !== "string" || !Object.hasOwn(fieldsOf, kind)) {
    throw fault("has an unknown kind");
  }
  const allowed = new Set(["kind", ...fieldsOf[kind as ShellMessage["kind"]]]);
  if (kind === "secret_answer") {
    if (typeof fields.result !== "string" || !Object.hasOwn(answerFieldsOf, fields.result)) {
      throw fault("has an unknown result");
    }
    for (const name of answerFieldsOf[fields.result as BrokerAnswer["result"]]) allowed.add(name);
  }
  if (Object.keys(fields).some((name) => !allowed.has(name))) {
    throw fault("has a field its kind doesn't");
  }
  if (!fieldsAreValid(kind as ShellMessage["kind"], fields)) {
    throw fault("has a field of the wrong type");
  }
  return fields as unknown as ShellMessage;
}

function fieldsAreValid(kind: ShellMessage["kind"], fields: Fields): boolean {
  switch (kind) {
    case "sandbox_host":
      return fields.connection === null || isConnection(fields.connection);
    case "stop":
      return true;
    case "secret_answer":
      return isRequestId(fields.id) && answerIsValid(fields);
  }
}

/** Checks the broker answer's own field; `result` is already one of the three. */
function answerIsValid(fields: Fields): boolean {
  switch (fields.result) {
    case "value":
      return fields.value === null || typeof fields.value === "string";
    case "origins":
      return fields.origins === null || isTextList(fields.origins);
    default:
      return typeof fields.reason === "string" && refusalReasons.has(fields.reason);
  }
}

function isConnection(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { url, token, ...rest } = value as { url?: unknown; token?: unknown };
  return typeof url === "string" && typeof token === "string" && Object.keys(rest).length === 0;
}

function isTextList(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** The engine numbers its requests from 1, so an id is a whole number above 0. */
function isRequestId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function fault(what: string): ControlPipeFault {
  return new ControlPipeFault(`A frame from the shell ${what}.`);
}
