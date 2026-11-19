import { parse, type Schema, s } from "@halonicjs/schema-kit";
import { type ErrorKind, KindedError } from "@halonicjs/std";
import { type AgentHostAnswer, answerError, readAnswer } from "./transport.ts";

/**
 * Why a connector failed, as the agent host says it with `connector_failed`
 * (`apps/agent-host/README.md`): the cause and the one name a page needs to
 * word it, never the error's own text (UX check C2, HAL-12410).
 */
export type ConnectorFailure =
  | { readonly reason: "program-missing"; readonly program: string }
  | { readonly reason: "secret-missing"; readonly secret: string }
  | { readonly reason: "secret-refused" }
  | { readonly reason: "stopped" };

const failureSchema = s.object({
  error: s.discriminatedUnion("reason", [
    s.object({
      kind: s.literal("connector_failed"),
      reason: s.literal("program-missing"),
      program: s.string().min(1),
    }),
    s.object({
      kind: s.literal("connector_failed"),
      reason: s.literal("secret-missing"),
      secret: s.string().min(1),
    }),
    s.object({ kind: s.literal("connector_failed"), reason: s.literal("secret-refused") }),
    s.object({ kind: s.literal("connector_failed"), reason: s.literal("stopped") }),
  ]),
});

/**
 * How a surface should respond to each cause: a missing program or a
 * stopped one can work on the next try, a missing secret is set first, and
 * a refused secret is a sign-in that no longer holds.
 */
const kindOf: Record<ConnectorFailure["reason"], ErrorKind> = {
  "program-missing": "unavailable",
  "secret-missing": "invalid_input",
  "secret-refused": "unauthenticated",
  stopped: "unavailable",
};

/**
 * A connector the agent host runs failed for a cause Studio can word. Its
 * `failure` holds the cause and the name; its message is a plain fallback,
 * safe to show, for a screen with no words of its own for the cause.
 */
export class ConnectorFailedError extends KindedError {
  readonly failure: ConnectorFailure;

  /**
   * @param failure - the cause, as the host (or the stand-in itself) found it
   * @param options - `message`, safe to show, replaces the fallback; `cause`
   *   keeps the host's refusal, for the log
   */
  constructor(
    failure: ConnectorFailure,
    options: { readonly message?: string; readonly cause?: unknown } = {},
  ) {
    const message = options.message ?? fallbackMessage(failure);
    super(kindOf[failure.reason], message, "cause" in options ? { cause: options.cause } : {});
    this.failure = failure;
  }
}

/**
 * The body of a connector route's `200` answer, checked against `schema`.
 *
 * @throws {@link ConnectorFailedError} for a `connector_failed` answer with a reason,
 *   else an `AgentHostError` for any other status or shape (see `readAnswer`)
 */
export function readConnectorAnswer<T>(
  route: string,
  answer: AgentHostAnswer,
  schema: Schema<T>,
): T {
  if (answer.status !== 200) {
    const failure = parse(failureSchema, answer.body);
    if (failure.ok) {
      throw new ConnectorFailedError(failureOf(failure.value.error), {
        cause: answerError(route, answer),
      });
    }
  }
  return readAnswer(route, answer, schema);
}

/** The cause alone, without the host's `kind` and message. */
function failureOf(error: ConnectorFailure & { readonly kind: string }): ConnectorFailure {
  switch (error.reason) {
    case "program-missing":
      return { reason: error.reason, program: error.program };
    case "secret-missing":
      return { reason: error.reason, secret: error.secret };
    default:
      return { reason: error.reason };
  }
}

function fallbackMessage(failure: ConnectorFailure): string {
  switch (failure.reason) {
    case "program-missing":
      return `The program ${failure.program} isn't on this computer.`;
    case "secret-missing":
      return `The secret ${failure.secret} isn't set on this computer.`;
    case "secret-refused":
      return "The connector didn't accept its secret.";
    case "stopped":
      return "The connector's program stopped before it answered.";
  }
}
