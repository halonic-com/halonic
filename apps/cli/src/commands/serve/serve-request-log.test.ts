import { MemorySecrets } from "@halonicjs/adapter-memory";
import type { PasswordHasher } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { plainText } from "../../messages/phrase.ts";
import { runCli } from "../../run-cli.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
} from "../../test/acme-runs.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { serveCommandWith } from "./command.ts";
import { serveRequestLog } from "./request-log.ts";

/** The first start opens the engine and the listener from cold imports. */
const slowStart = { timeout: 10_000 };

/** A test that starts `halonic serve`: the first start opens it from cold imports. */
const slowTest = 30_000;

/** A hasher whose hash is readable, so a test can set the password's hash in the secrets. */
const hasher: PasswordHasher = {
  hash: async (typed) => `hash:${typed}`,
  verify: async (typed, hash) => hash === `hash:${typed}`,
  needsRehash: () => false,
};

/** What a caller sends that the log must never hold: a code, a pending ID, a token, a query. */
const wrongCode = "QZQZ-QZQZ";
const pendingIdCanary = "pending-canary-7f3a";
const tokenCanary = "token-canary-9c1e";
const queryCanary = "query-canary-4b2d";

let acmeRuns: AcmeRuns;
let running: { signals: ReturnType<typeof fakeSignals>; serving: Promise<number> } | undefined;

// This Acme reaches only the test model, so it needs no trust.
beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("serve-request-log");
});

afterEach(async () => {
  if (running !== undefined) {
    running.signals.send("SIGINT");
    await running.serving.catch(() => undefined);
    running = undefined;
  }
  await removeAcmeRuns(acmeRuns);
});

/** Starts `halonic serve` with a sign-in password and gives its address and what it printed. */
async function startServe() {
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const secrets = new MemorySecrets({ "serve-password": "hash:correct horse" });
  const command = serveCommandWith({ ...acmeRunsSetup(acmeRuns), hasher });
  const serving = runCli(["serve", "--port", "0"], io, [command], {
    secrets,
    stop: { signals, exitNow: () => undefined },
  });
  running = { signals, serving };
  await waitUntil("the server to print its address", () => io.stdout.length >= 1, slowStart);
  const found = /(http:\/\/localhost:\d+)/u.exec(io.stdout[0] ?? "");
  if (found?.[1] === undefined) throw new Error(`No address in ${JSON.stringify(io.stdout[0])}.`);
  return { address: found[1], io };
}

async function post(address: string, path: string, body: unknown): Promise<number> {
  const response = await fetch(`${address}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  await response.body?.cancel();
  return response.status;
}

/** The request lines `serve` printed, in order. */
function requestLines(stdout: readonly string[]): string[] {
  return stdout.filter((line) => /^(GET|POST) \//u.test(line));
}

verifies("cli.commands.serve.request-log", () => {
  it(
    "logs every pairing try with its status, and never the code, the pending ID or the token",
    async () => {
      const { address, io } = await startServe();
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 11; attempt += 1) {
        statuses.push(await post(address, "/api/pair", { code: wrongCode, deviceName: "Pixel 9" }));
      }
      expect(statuses).toEqual([...Array<number>(10).fill(401), 429]);
      await post(address, "/api/pair/status", { pendingId: pendingIdCanary });
      const hello = await fetch(`${address}/api/hello?probe=${queryCanary}`, {
        headers: { authorization: `Bearer ${tokenCanary}` },
      });
      await hello.body?.cancel();
      await waitUntil("the hello line", () => io.stdout.includes("GET /api/hello 200"), slowStart);

      const lines = requestLines(io.stdout);
      expect(lines.filter((line) => line === "POST /api/pair 401")).toHaveLength(10);
      expect(lines.filter((line) => line === "POST /api/pair 429")).toHaveLength(1);
      expect(lines.slice(0, 11)).toEqual([
        ...Array<string>(10).fill("POST /api/pair 401"),
        "POST /api/pair 429",
      ]);
      const everything = [...io.stdout, ...io.stderr].join("\n");
      for (const canary of [wrongCode, pendingIdCanary, tokenCanary, queryCanary]) {
        expect(everything).not.toContain(canary);
      }
    },
    slowTest,
  );

  it("makes a caller's method and path printable, so a control character can't forge a line", () => {
    const printed: string[] = [];
    const log = serveRequestLog({ printAhead: (line) => printed.push(plainText(line)) });
    log.record({ method: "GET", path: "/api/hello\nPOST /api/pair 200", status: 404 });
    expect(printed).toHaveLength(1);
    expect(printed[0]).not.toContain("\n");
    expect(printed[0]).toMatch(/^GET \/api\/hello.* 404$/u);
  });
});
