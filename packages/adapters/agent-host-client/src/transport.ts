import { formatPath, parse, type Schema, s } from "@halonicjs/schema-kit";

/**
 * The agent host's routes that answer once with JSON
 * (`apps/agent-host/README.md`). The shell lets a page call these names and
 * no others, never a URL.
 */
export const agentHostRequestRoutes = [
  "GET /v1/health",
  "GET /v1/sandbox/check",
  "GET /v1/sandbox/capabilities",
  "POST /v1/sandbox/sessions/open",
  "POST /v1/sandbox/sessions/close",
  "POST /v1/bridge/answer",
  "POST /v1/bridge/close",
  "GET /v1/harnesses",
  "POST /v1/harnesses/detect",
  "POST /v1/harnesses/runs/send",
  "POST /v1/harnesses/runs/cancel",
] as const;

/** The agent host's routes that answer with an NDJSON stream. */
export const agentHostStreamRoutes = [
  "POST /v1/sandbox/sessions/blocked",
  "POST /v1/bridge/open",
  "POST /v1/harnesses/runs/start",
] as const;

export type AgentHostRequestRoute = (typeof agentHostRequestRoutes)[number];
export type AgentHostStreamRoute = (typeof agentHostStreamRoutes)[number];

/** The host's answer: its status and its JSON body. */
export interface AgentHostAnswer {
  readonly status: number;
  readonly body: unknown;
}

/** A stream route's answer: its lines, each parsed from JSON, or the error the host answered instead. */
export type AgentHostStreamAnswer =
  | { readonly ok: true; readonly lines: AsyncIterable<unknown> }
  | { readonly ok: false; readonly answer: AgentHostAnswer };

/**
 * How the stand-ins reach the agent host. In Studio, the shell makes the
 * calls, so the launch token never reaches the page; in tests, an in-memory
 * host answers.
 */
export interface AgentHostTransport {
  /**
   * Calls a JSON route: a `GET` without a body, a `POST` with one. The body
   * goes to the host as compact JSON, the text `JSON.stringify(body)` makes,
   * with nothing added: the bridge measures its answers against the host's
   * 1 MiB limit that way.
   *
   * @throws when the host can't be reached, or `signal` aborts the call
   */
  request(
    route: AgentHostRequestRoute,
    body?: unknown,
    options?: { readonly signal?: AbortSignal },
  ): Promise<AgentHostAnswer>;
  /**
   * Calls a stream route. Its lines end when the host ends the stream, and
   * the call stops when `signal` aborts, which the host takes as the caller
   * going away.
   *
   * @throws when the host can't be reached
   */
  stream(
    route: AgentHostStreamRoute,
    body: unknown,
    options: { readonly signal: AbortSignal },
  ): Promise<AgentHostStreamAnswer>;
}

/** What the host refused, with its status and `kind` (`unknown_session`, `send_failed`, ...). */
export class AgentHostError extends Error {
  override readonly name = "AgentHostError";
  /**
   * The HTTP status the host answered with; `200` for a problem inside a good
   * answer, `0` when the call never reached the host (the transport refused it).
   */
  readonly status: number;
  readonly kind: string;

  constructor(status: number, kind: string, message: string) {
    super(message);
    this.status = status;
    this.kind = kind;
  }
}

const errorBody = s.object({
  error: s.object({ kind: s.string(), message: s.string().optional() }),
});

/** The error an answer that isn't `200` stands for, from the host's `{ error: { kind, message } }`. */
export function answerError(route: string, answer: AgentHostAnswer): AgentHostError {
  const parsed = parse(errorBody, answer.body);
  const kind = parsed.ok ? parsed.value.error.kind : "unknown";
  const message = parsed.ok ? parsed.value.error.message : undefined;
  return new AgentHostError(
    answer.status,
    kind,
    message ?? `The agent host answered ${route} with ${answer.status} (${kind}).`,
  );
}

/**
 * The body of a `200` answer, checked against `schema`.
 *
 * @throws {@link AgentHostError} for any other status, or a body of another shape
 */
export function readAnswer<T>(route: string, answer: AgentHostAnswer, schema: Schema<T>): T {
  if (answer.status !== 200) throw answerError(route, answer);
  return checked(route, answer.body, schema);
}

/**
 * `value` checked against `schema`, for a body or a stream line from the host.
 *
 * @throws {@link AgentHostError} with kind `answer_invalid` naming each problem
 */
export function checked<T>(route: string, value: unknown, schema: Schema<T>): T {
  const parsed = parse(schema, value);
  if (parsed.ok) return parsed.value as T;
  const problems = parsed.error.map((issue) => `${formatPath(issue.path)}: ${issue.message}`);
  throw new AgentHostError(
    200,
    "answer_invalid",
    `The agent host's answer to ${route} isn't what Halonic expects: ${problems.join("; ")}.`,
  );
}
