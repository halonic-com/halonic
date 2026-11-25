import { MemorySecrets } from "@halonicjs/adapter-memory";
import type { PasswordHasher } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runCli } from "../../run-cli.ts";
import { openSecretStore } from "../../secret-host.ts";
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
/** The key the board approves for the second connection, made up as the canary is. */
const newKey = "pcp_board_second-canary-key-for-serve-tests-only";
const challengeId = "69effd29-0000-4000-8000-000000000002";

/** A hasher whose hash is plain to read: these tests are about the messaging, not the password. */
const plainHasher: PasswordHasher = {
  hash: async (text) => `plain:${text}`,
  verify: async (text, hash) => hash === `plain:${text}`,
  needsRehash: () => false,
};

/**
 * Acme's Paperclip with its CLI sign-in too: a challenge the board approves at once, handing
 * out {@link newKey}. Every request's key is kept, the sign-in's own included.
 */
class FakeSignInPaperclip {
  readonly messaging = new FakePaperclip();
  readonly keys: (string | undefined)[] = [];

  readonly fetch = async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    this.keys.push(request.headers.get("authorization")?.replace(/^Bearer /u, ""));
    if (path === "/api/cli-auth/challenges") {
      return Response.json({
        id: challengeId,
        token: "made-up",
        boardApiToken: newKey,
        approvalPath: `/cli-auth/${challengeId}?token=made-up-challenge-secret`,
      });
    }
    if (path === `/api/cli-auth/challenges/${challengeId}`) {
      return Response.json({ id: challengeId, status: "approved" });
    }
    if (path === "/api/cli-auth/me") {
      return Response.json({ userId: "user-ada", companyIds: [acme.company] });
    }
    if (path === "/api/cli-auth/revoke-current") return Response.json({ revoked: true });
    return this.messaging.fetch(request);
  };
}

let acmeRuns: AcmeRuns;
let paperclip: FakeSignInPaperclip;
let running: { signals: ReturnType<typeof fakeSignals>; serving: Promise<number> } | undefined;

// This Acme reaches only the test model, so it needs no trust and these tests reach the listener.
beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("serve-messaging-mount");
  await writeConnection(acmeRuns.acme, "halonic", { label: "Halonic", ...acme });
  await writeConnection(acmeRuns.acme, "studio", { label: "Studio", ...acme });
  await openSecretStore(acmeRuns.profile).set(
    paperclipKeySecretName("halonic"),
    JSON.stringify({ key: canaryKey, ...acme }),
  );
  paperclip = new FakeSignInPaperclip();
});

afterEach(async () => {
  if (running !== undefined) {
    running.signals.send("SIGINT");
    await running.serving.catch(() => undefined);
    running = undefined;
  }
  await removeAcmeRuns(acmeRuns);
});

/** Runs `halonic serve --port 0` with the sign-in password set, and answers its address. */
async function startServe(): Promise<string> {
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const setup = {
    ...acmeRunsSetup(acmeRuns),
    hasher: plainHasher,
    paperclipFetch: paperclip.fetch,
  };
  const serving = runCli(["serve", "--port", "0"], io, [serveCommandWith(setup)], {
    secrets: new MemorySecrets({ "serve-password": `plain:${password}` }),
    stop: { signals, exitNow: () => undefined },
  });
  running = { signals, serving };
  await waitUntil("the server to print its address", () => io.stdout.length >= 1, slowStart);
  const address = /http:\/\/localhost:\d+/u.exec(io.stdout[0] ?? "")?.[0];
  if (address === undefined) throw new Error(`No address in: ${io.stdout[0]}`);
  return address;
}

/** A client of the started server, signed in with the password. */
async function signedInClient(address: string) {
  const login = await fetch(`${address}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (login.status !== 200 || cookie === undefined) throw new Error("The test couldn't sign in.");
  const headers = { cookie, origin: address, "content-type": "application/json" };
  return {
    get: (path: string) => fetch(`${address}${path}`, { headers }),
    post: (path: string, body: unknown) =>
      fetch(`${address}${path}`, { method: "POST", headers, body: JSON.stringify(body) }),
  };
}

type Client = Awaited<ReturnType<typeof signedInClient>>;

/** The source IDs `GET /api/messaging/sources` answers. */
async function sourceIds(client: Client): Promise<string[]> {
  const answer = await client.get("/api/messaging/sources");
  expect(answer.status).toBe(200);
  const { items } = (await answer.json()) as { items: { id: string }[] };
  return items.map((source) => source.id).sort();
}

/**
 * Signs `connection` in through the server's own routes, with the serve-password the key routes
 * ask for again; the fake board approves at once.
 */
async function signInSecond(client: Client, connection: string): Promise<unknown> {
  const start = await client.post("/api/paperclip-keys/sign-in/start", {
    address: acme.address,
    connection,
    password,
  });
  const { signInId } = (await start.json()) as { signInId: string };
  const poll = await client.post("/api/paperclip-keys/sign-in/poll", { signInId });
  return poll.json();
}

verifies("cli.commands.serve.messaging-mount", () => {
  it("answers the stored connection's source to a signed-in session", async () => {
    const client = await signedInClient(await startServe());

    expect(await sourceIds(client)).toEqual(["paperclip:halonic"]);
    const agents = await client.get("/api/messaging/agents");
    expect(agents.status).toBe(200);
    expect(paperclip.keys).toContain(canaryKey);
  });

  it("lists a connection signed in while serving, without a restart, and reads it with the new key", async () => {
    const client = await signedInClient(await startServe());
    expect(await sourceIds(client)).toEqual(["paperclip:halonic"]);

    expect(await signInSecond(client, "studio")).toMatchObject({ status: "connected" });

    expect(await sourceIds(client)).toEqual(["paperclip:halonic", "paperclip:studio"]);
    const before = paperclip.keys.length;
    await client.get("/api/messaging/agents");
    expect(paperclip.keys.slice(before)).toContain(newKey);
  });

  it("drops a disconnected connection at once, and no later call carries its key", async () => {
    const client = await signedInClient(await startServe());
    await signInSecond(client, "studio");

    const disconnect = await client.post("/api/paperclip-keys/disconnect", {
      connection: "studio",
      password,
    });
    expect(await disconnect.json()).toEqual({ outcome: "disconnected", revoked: true });
    const after = paperclip.keys.length;

    expect(await sourceIds(client)).toEqual(["paperclip:halonic"]);
    for (const path of ["agents", "conversations", "inbox-items", "work"]) {
      await client.get(`/api/messaging/${path}`);
    }
    expect(paperclip.keys.slice(after)).toContain(canaryKey);
    expect(paperclip.keys.slice(after)).not.toContain(newKey);
  });

  it("answers 401 to a request with no session, as every messaging route does", async () => {
    const address = await startServe();

    const answer = await fetch(`${address}/api/messaging/sources`);

    expect(answer.status).toBe(401);
  });
});
