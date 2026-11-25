import { MemorySecrets } from "@halonicjs/adapter-memory";
import type { PasswordHasher } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runCli } from "../../run-cli.ts";
import { openSecretService, openSecretStore } from "../../secret-host.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
} from "../../test/acme-runs.ts";
import { captureIo } from "../../test/capture-io.ts";
import { acme, canaryKey, FakePaperclip, writeConnection } from "../../test/fake-paperclip.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { serveCommandWith } from "./command.ts";
import { paperclipKeySecretName } from "./serve-messaging.ts";

/** The first start opens the engine and the listener from cold imports. */
const slowStart = { timeout: 10_000 };

const password = "acme-owner-password";

/** A hasher whose hash is plain to read: these tests are about the key, not the password. */
const plainHasher: PasswordHasher = {
  hash: async (text) => `plain:${text}`,
  verify: async (text, hash) => hash === `plain:${text}`,
  needsRehash: () => false,
};

let acmeRuns: AcmeRuns;
let running: { signals: ReturnType<typeof fakeSignals>; serving: Promise<number> } | undefined;

// This Acme reaches only the test model, so it needs no trust and these tests reach the listener.
beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("serve-paperclip-key");
  await writeConnection(acmeRuns.acme, "halonic", { label: "Halonic", ...acme });
  await openSecretStore(acmeRuns.profile).set(
    paperclipKeySecretName("halonic"),
    JSON.stringify({ key: canaryKey, ...acme }),
  );
});

afterEach(async () => {
  if (running !== undefined) {
    running.signals.send("SIGINT");
    await running.serving.catch(() => undefined);
    running = undefined;
  }
  await removeAcmeRuns(acmeRuns);
});

/** Runs `halonic --debug serve --port 0`, with the sign-in password set when `withPassword` is. */
function startServe(withPassword: boolean) {
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const secrets = new MemorySecrets(withPassword ? { "serve-password": `plain:${password}` } : {});
  const setup = {
    ...acmeRunsSetup(acmeRuns),
    hasher: plainHasher,
    paperclipFetch: new FakePaperclip().fetch,
  };
  const serving = runCli(["--debug", "serve", "--port", "0"], io, [serveCommandWith(setup)], {
    secrets,
    stop: { signals, exitNow: () => undefined },
  });
  running = { signals, serving };
  return { io, serving };
}

function addressOf(line: string | undefined): string {
  const address = /http:\/\/localhost:\d+/u.exec(line ?? "")?.[0];
  if (address === undefined) throw new Error(`No address in: ${line}`);
  return address;
}

/** Signs in with the password and answers the session cookie. */
async function signIn(address: string): Promise<string> {
  const answer = await fetch(`${address}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = answer.headers.get("set-cookie")?.split(";")[0];
  if (answer.status !== 200 || cookie === undefined) throw new Error("The test couldn't sign in.");
  return cookie;
}

verifies("server.paperclip-key-store", () => {
  it("doesn't start with a stored key and no sign-in password, and says how to set one", async () => {
    const { io, serving } = startServe(false);

    expect(await serving).toBe(2);
    running = undefined;
    const said = io.stderr.join("\n");
    expect(said).toContain("Serving a Paperclip connection needs a sign-in password");
    expect(said).toContain("halonic secret set serve-password");
  });

  it("refuses the key's name on the secret routes, and no answer or log line holds the key", async () => {
    const { io } = startServe(true);
    await waitUntil("the server to print its address", () => io.stdout.length >= 1, slowStart);
    const address = addressOf(io.stdout[0]);
    const cookie = await signIn(address);
    const stored = paperclipKeySecretName("halonic");

    const answers: string[] = [];
    const statuses: Record<string, number> = {};
    const paths = [
      "/api/hello",
      "/api/workspace",
      "/api/routines",
      "/api/runs",
      "/api/model-choice/key-saved/anthropic",
      `/api/secrets/${stored}`,
      `/api/secrets/${stored.toUpperCase()}`,
      "/api/secrets/paperclip-key/halonic",
      "/api/secrets/paperclip-key%2Fhalonic",
    ];
    for (const path of paths) {
      for (const method of ["GET", "DELETE"]) {
        const answer = await fetch(`${address}${path}`, { method, headers: { cookie } });
        statuses[`${method} ${path}`] = answer.status;
        answers.push(await answer.text());
      }
    }

    for (const path of paths.filter((path) => path.startsWith("/api/secrets/"))) {
      expect(statuses[`GET ${path}`], path).toBe(400);
      expect(statuses[`DELETE ${path}`], path).toBe(400);
    }
    expect(statuses["GET /api/hello"]).toBe(200);
    expect(await openSecretStore(acmeRuns.profile).get(stored)).toContain(canaryKey);
    expect(answers.join("\n")).not.toContain(canaryKey);
    expect([...io.stdout, ...io.stderr].join("\n")).not.toContain(canaryKey);
  });

  it("leaves the key out of `halonic secret list`, which can't set or remove it either", async () => {
    const secrets = openSecretService({ profile: acmeRuns.profile, hasher: plainHasher });
    const stored = paperclipKeySecretName("halonic");

    expect(await secrets.list()).not.toContain(stored);
    expect(await secrets.set({ name: stored, value: "other" })).toMatchObject({ changed: false });
    expect(await secrets.remove(stored)).toMatchObject({ changed: false });
    expect(await openSecretStore(acmeRuns.profile).get(stored)).toContain(canaryKey);
  });
});
