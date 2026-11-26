import { type TauriCallbacks, TauriChannel, type TauriIpc } from "@halonicjs/studio-services";

/**
 * The JSON routes of an owner server the page may read through the shell, by the names of the
 * shell's list (`DeploymentRoute` in `halonic-owner-sign-in`). An answer to a run isn't one: it
 * comes with the run view's answer handles (RO-4).
 */
export type DeploymentJsonRoute = "GET /api/waiting-runs" | "GET /api/runs/{run}";

const jsonRoutes: readonly string[] = [
  "GET /api/waiting-runs",
  "GET /api/runs/{run}",
] satisfies DeploymentJsonRoute[];

/** The route of a run's events, server-sent events the shell passes on one by one. */
const eventsRoute = "GET /api/runs/{run}/events";

/** The server's answer as the shell passes it: its status and its body, `null` when empty. */
export interface DeploymentAnswer {
  readonly status: number;
  readonly body: unknown;
}

/** One message of a run's event stream, as the shell passes it on. */
export type DeploymentStreamMessage =
  | { readonly type: "event"; readonly event: string; readonly data: string; readonly id?: string }
  | { readonly type: "end" }
  | { readonly type: "failed"; readonly message: string };

/** A stream the server opened, which `end` hangs up on; or its refusal. */
export type DeploymentStreamOpening =
  | { readonly kind: "opened"; readonly end: () => void }
  | { readonly kind: "refused"; readonly answer: DeploymentAnswer };

/** The reads of one owner server's runs, all through the shell. */
export interface DeploymentCalls {
  /** Calls a JSON route; `run` for a route that names one. */
  request(route: DeploymentJsonRoute, run?: string): Promise<DeploymentAnswer>;
  /**
   * Opens run `run`'s events after the event `after` (all of them when `undefined`). Each message
   * goes to `onMessage`, which may hear some before the opening resolves; the last is `end` or
   * `failed`.
   */
  openEvents(
    run: string,
    after: number | undefined,
    onMessage: (message: DeploymentStreamMessage) => void,
  ): Promise<DeploymentStreamOpening>;
}

/**
 * Why the shell made no call or passed no answer on: its code, such as `notSignedIn`,
 * `unknownRoute`, `badRun`, `redirected`, `notAnswering` or `unreadable`, or `answerInvalid` when
 * its answer isn't one Halonic reads.
 */
export class DeploymentCallRefused extends Error {
  override readonly name = "DeploymentCallRefused";
  readonly code: string;

  constructor(code: string) {
    super(`The shell refused the call to the server: ${code}.`);
    this.code = code;
  }
}

/** The shell keys a stream by the page and this number; a module runs once per page. */
let nextStreamId = 1;

/**
 * The runs of the owner server at `origin` through the shell's `deployment_request`,
 * `deployment_stream` and `deployment_stream_end` commands (`apps/studio/src-tauri/src/
 * deployment_calls.rs`). Every call names `origin` and a route of the list, never a path or a
 * header: the shell adds the session, which the page never sees, and calls only an origin it keeps
 * one for.
 */
export function tauriDeploymentCalls(
  ipc: TauriIpc & TauriCallbacks,
  origin: string,
): DeploymentCalls {
  return {
    request: async (route, run) => {
      if (!jsonRoutes.includes(route)) throw new DeploymentCallRefused("unknownRoute");
      return answerOf(await invoke(ipc, "deployment_request", { origin, route, run }));
    },
    openEvents: (run, after, onMessage) => openEvents(ipc, origin, run, after, onMessage),
  };
}

async function openEvents(
  ipc: TauriIpc & TauriCallbacks,
  origin: string,
  run: string,
  after: number | undefined,
  onMessage: (message: DeploymentStreamMessage) => void,
): Promise<DeploymentStreamOpening> {
  const stream = nextStreamId++;
  const channel = new TauriChannel(ipc, (raw) => {
    const message = messageOf(raw);
    if (message.type !== "event") channel.close();
    onMessage(message);
  });
  const hangUp = () => {
    channel.close();
    ipc.invoke("deployment_stream_end", { stream }).catch((failure: unknown) => {
      console.error("Couldn't tell the shell a server stream ended.", failure);
    });
  };
  let start: unknown;
  try {
    const args = { origin, route: eventsRoute, run, after, stream, channel: channel.argument };
    start = await invoke(ipc, "deployment_stream", args);
  } catch (error) {
    channel.close();
    throw error;
  }
  if (isRecord(start) && "answer" in start) {
    channel.close();
    return { kind: "refused", answer: answerOf(start["answer"]) };
  }
  if (!isRecord(start) || start["stream"] !== stream) {
    hangUp();
    throw new DeploymentCallRefused("answerInvalid");
  }
  return { kind: "opened", end: hangUp };
}

/** Invokes `command`, turning the shell's refusal `{ code }` into a {@link DeploymentCallRefused}. */
async function invoke(
  ipc: TauriIpc,
  command: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    return await ipc.invoke(command, args);
  } catch (error) {
    if (isRecord(error) && typeof error["code"] === "string") {
      throw new DeploymentCallRefused(error["code"]);
    }
    throw error;
  }
}

function answerOf(answer: unknown): DeploymentAnswer {
  if (!isRecord(answer) || typeof answer["status"] !== "number" || !("body" in answer)) {
    throw new DeploymentCallRefused("answerInvalid");
  }
  return { status: answer["status"], body: answer["body"] };
}

/** A shell message as read; one Halonic can't read ends the stream as `failed`. */
function messageOf(raw: unknown): DeploymentStreamMessage {
  if (isRecord(raw)) {
    const { type, event, data, id, message } = raw;
    if (type === "end") return { type };
    if (type === "failed" && typeof message === "string") return { type, message };
    if (type === "event" && typeof event === "string" && typeof data === "string") {
      return typeof id === "string" ? { type, event, data, id } : { type, event, data };
    }
  }
  return { type: "failed", message: "the shell sent a message Halonic doesn't read" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
