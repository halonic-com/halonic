import { request } from "node:http";
import { createServer } from "node:net";
import { MemorySecrets } from "@halonicjs/adapter-memory";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
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

/** The first start opens the engine and the listener from cold imports. */
const slowStart = { timeout: 10_000 };

const publicOrigin = "https://engine.example.com";

let acmeRuns: AcmeRuns;
let running: { signals: ReturnType<typeof fakeSignals>; serving: Promise<number> } | undefined;

// This Acme reaches only the test model, so it needs no trust and these tests reach the listener.
beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("serve-public-origin");
});

afterEach(async () => {
  if (running !== undefined) {
    running.signals.send("SIGINT");
    await running.serving.catch(() => undefined);
    running = undefined;
  }
  await removeAcmeRuns(acmeRuns);
});

/** Runs `halonic serve`, with a sign-in password set when `password` is. */
function startServe(password: boolean, ...args: string[]) {
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const secrets = new MemorySecrets(password ? { "serve-password": "a-stored-hash" } : {});
  const serving = runCli(["serve", ...args], io, [serveCommandWith(acmeRunsSetup(acmeRuns))], {
    secrets,
    stop: { signals, exitNow: () => undefined },
  });
  running = { signals, serving };
  return { io, serving };
}

/** A port nothing listens on right now; the line `serve` prints names the public origin, not the port. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  if (address === null || typeof address === "string") throw new Error("No port.");
  return address.port;
}

/** `GET /api/hello` on `127.0.0.1:port`, as a proxy on this computer sends it, with this `Host`. */
function hello(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      { host: "127.0.0.1", port, path: "/api/hello", headers: { host } },
      (incoming) => {
        incoming.resume();
        incoming.on("end", () => resolve(incoming.statusCode ?? 0));
      },
    );
    outgoing.on("error", reject);
    outgoing.end();
  });
}

verifies("server.public-endpoint", () => {
  it("refuses to start without a sign-in password, and says how to set one", async () => {
    const { io, serving } = startServe(false, "--public-origin", publicOrigin, "--port", "0");

    expect(await serving).toBe(2);
    running = undefined;
    const said = io.stderr.join("\n");
    expect(said).toContain("Serving at a public address needs a password");
    expect(said).toContain("halonic secret set serve-password");
  });

  it("refuses to start together with --network", async () => {
    const { io, serving } = startServe(true, "--network", "--public-origin", publicOrigin);

    expect(await serving).toBe(2);
    running = undefined;
    expect(io.stderr.join("\n")).toContain(
      "--public-origin can't go with --network: the proxy on this computer is the only way in.",
    );
  });

  it("refuses an origin that isn't https or has a path", async () => {
    for (const origin of ["http://engine.example.com", "https://engine.example.com/api"]) {
      const { io, serving } = startServe(true, "--public-origin", origin);
      expect(await serving, origin).toBe(2);
      running = undefined;
      expect(io.stderr.join("\n")).toContain("--public-origin needs an https address with no path");
    }
  });

  it("serves on 127.0.0.1 at the public name only, and names that origin", async () => {
    const port = await freePort();
    const { io } = startServe(true, "--public-origin", publicOrigin, "--port", String(port));
    await waitUntil("the server to print its address", () => io.stdout.length >= 1, slowStart);

    expect(io.stdout[0]).toBe(`Serving Acme at ${publicOrigin}. Stop with Ctrl C.`);
    expect(await hello(port, "engine.example.com")).toBe(200);
    for (const host of ["localhost", `localhost:${port}`, "127.0.0.1", "other.example.com"]) {
      expect(await hello(port, host), host).toBe(421);
    }
  });
});
