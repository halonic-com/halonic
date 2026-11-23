/** A deployed Worker the run check signs in to. */
export interface RunTarget {
  /** The Worker's address, such as `https://hlt-1-1.example.workers.dev`. */
  readonly baseUrl: string;
  /** The sign-in password. Never printed. */
  readonly password: string;
  /** Tests inject this; defaults to `fetch`. */
  readonly fetch?: typeof fetch;
}

/** The workflow a run check starts. */
export interface RunStart {
  readonly hubId: string;
  readonly workflowId: string;
}

/** One event of a run's log, as the event stream sends it. */
export interface StreamedEvent {
  readonly seq: number;
  readonly type: string;
}

/** Signs in with the password and returns the session cookie to send back. */
export async function signIn(target: RunTarget): Promise<string> {
  const response = await call(target, "/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: target.password }),
  });
  await expectStatus("sign-in", response, 200);
  // Only the `name=value` part goes back; the attributes are for a browser.
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  if (cookie === "") throw new Error("The sign-in was answered 200 with no session cookie.");
  return cookie;
}

/** Starts a run of the workflow and returns its id. */
export async function startRun(target: RunTarget, cookie: string, run: RunStart): Promise<string> {
  const response = await call(target, "/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ ...run, input: {} }),
  });
  await expectStatus("run start", response, 200);
  const id = ((await response.json()) as { id?: unknown } | null)?.id;
  if (typeof id !== "string") throw new Error("The run start was answered with no run id.");
  return id;
}

/**
 * Reads a run's events from its event stream until the stream's `end` message, which the Worker
 * sends once the run has ended and every event was sent.
 *
 * @throws Error when the stream closes without an `end` message
 */
export async function readRunEvents(
  target: RunTarget,
  cookie: string,
  runId: string,
): Promise<StreamedEvent[]> {
  const response = await call(target, `/api/runs/${encodeURIComponent(runId)}/events`, {
    headers: { cookie },
  });
  await expectStatus("event stream", response, 200);
  const events: StreamedEvent[] = [];
  for (const message of (await response.text()).split("\n\n")) {
    const name = /^event: (.*)$/m.exec(message)?.[1];
    if (name === "end") return events;
    const data = /^data: (.*)$/m.exec(message)?.[1];
    if (name === "run" && data !== undefined) events.push(JSON.parse(data) as StreamedEvent);
  }
  throw new Error(`The event stream of run ${runId} closed before the run ended.`);
}

/** The run checks of a deployed Worker. A check that fails throws an `Error` that names what differed. */
export const runChecks = {
  /** A started workflow whose step asks a model runs to `run.completed`, with the model's answer in its log. */
  async runToCompletion(target: RunTarget, run: RunStart): Promise<void> {
    const cookie = await signIn(target);
    const runId = await startRun(target, cookie, run);
    const types = (await readRunEvents(target, cookie, runId)).map((event) => event.type);
    if (!types.includes("llm.response")) {
      throw new Error(`Run ${runId} ended with no model answer: ${types.join(", ")}.`);
    }
    if (types.at(-1) !== "run.completed") {
      throw new Error(`Run ${runId} ended with ${types.at(-1) ?? "no event"}, not run.completed.`);
    }
  },
};

function call(target: RunTarget, path: string, init: RequestInit): Promise<Response> {
  return (target.fetch ?? fetch)(new URL(path, target.baseUrl), init);
}

async function expectStatus(what: string, response: Response, status: number): Promise<void> {
  if (response.status !== status) {
    const body = await response.text();
    throw new Error(`The ${what} was answered ${response.status}, expected ${status}: ${body}`);
  }
}
