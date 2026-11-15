/**
 * A run's live events through the real Worker inside workerd, with real run objects. Run by
 * `serve-run-events-workerd.test.ts`.
 */

import { env } from "cloudflare:workers";
import { createPbkdf2ChainHasher } from "@halonicjs/adapter-password-pbkdf2";
import { completed, entered, started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "../env.ts";
import { createRuntime } from "../runtime.ts";
import { serveRequest } from "../serve.ts";

export { CoordinationObject, RoutinesObject, RunObject } from "../index.ts";

const host = "halonic.example.com";
const password = "a password made up for this test";

let configured: RuntimeEnv | undefined;

/** The deployment these cases run against, made on first use: the password hash costs six PBKDF2 runs. */
async function deployment(): Promise<RuntimeEnv> {
  configured ??= {
    ...(env as unknown as RuntimeEnv),
    HALONIC_SECRET_TOKEN_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    HALONIC_SECRET_SERVE_PASSWORD: await createPbkdf2ChainHasher().hash(password),
    HALONIC_ALLOWED_HOSTS: host,
    HALONIC_DEPLOYMENT_ID: "serve-run-events-spec",
  } as unknown as RuntimeEnv;
  return configured;
}

// Each case gets storage of its own, so the runs of one never reach another.
let scope = 0;
function nextScope(): string {
  scope += 1;
  return `serve-run-events-spec-${scope}`;
}

async function ask(
  scopeName: string,
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<Response> {
  return serveRequest(
    new Request(`https://${host}${path}`, {
      method: options.method ?? "GET",
      headers: {
        host,
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.7",
        ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    }),
    await deployment(),
    { scope: scopeName },
  );
}

/** Signs in, and gives the cookie of the session. */
async function signIn(scopeName: string): Promise<string> {
  const login = await ask(scopeName, "/api/login", { method: "POST", body: { password } });
  return (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

/** The `id` of each `run` message, then `end` if the stream ended. */
function summary(text: string): string[] {
  return text
    .split("\n\n")
    .filter((message) => message !== "")
    .map((message) =>
      message.includes("event: end") ? "end" : (/^id: (\d+)/.exec(message)?.[1] ?? "?"),
    );
}

describe("a run's live events in workerd", () => {
  it("streams the stored events and the ones appended while it is open, then ends", async () => {
    const scopeName = nextScope();
    const cookie = await signIn(scopeName);
    const { runStore } = await createRuntime(await deployment(), { scope: scopeName });
    await runStore.append("run-1", 0, [started("run-1"), entered("run-1", 2)]);

    const response = await ask(scopeName, "/api/runs/run-1/events", { cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await runStore.append("run-1", 2, [entered("run-1", 3)]);
    await runStore.append("run-1", 3, [completed("run-1", 4)]);
    expect(summary(await response.text())).toEqual(["1", "2", "3", "4", "end"]);
  });

  it("resumes after the last id a client saw, without a repeat", async () => {
    const scopeName = nextScope();
    const cookie = await signIn(scopeName);
    const { runStore } = await createRuntime(await deployment(), { scope: scopeName });
    await runStore.append("run-2", 0, [
      started("run-2"),
      entered("run-2", 2),
      completed("run-2", 3),
    ]);
    const response = await ask(scopeName, "/api/runs/run-2/events?after=2", { cookie });
    expect(summary(await response.text())).toEqual(["3", "end"]);
  });

  it("answers 404 for a run nobody stored, and 401 without a session", async () => {
    const scopeName = nextScope();
    const cookie = await signIn(scopeName);
    expect((await ask(scopeName, "/api/runs/run-none/events", { cookie })).status).toBe(404);
    expect((await ask(scopeName, "/api/runs/run-none/events")).status).toBe(401);
  });
});
