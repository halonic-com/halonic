// One-off deployed check of the run container (HAL-18578). Never merged. It drives the same
// container class as the Worker (#5907's image, the adapter's RunContainerObject and the outbound
// gate) and answers GET /check with one pass/fail line per check.
import { WorkerEntrypoint } from "cloudflare:workers";
import {
  type ContainerOutboundProps,
  RunContainerObject,
} from "@halonicjs/adapter-cloudflare-durable";
import { outboundGate } from "@halonicjs/adapter-sandbox-cloudflare-container";

interface CheckEnv {
  CHECK_CONTAINER: DurableObjectNamespace<CheckContainerObject>;
  CHECK_TOKEN: string;
}

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

/** The only site the check's rules allow; the control check must reach it. */
const ALLOWED_SITE = "example.com";

/** How long the check waits for a started container to report it is running. */
const startWaitMs = 60_000;

/** Runs in the container with node: each prints one JSON line `{ pass, detail }`. */
const PROBES: Record<string, string> = {
  "control: allowed site answers": `fetch("https://${ALLOWED_SITE}/").then(
    (r) => console.log(JSON.stringify({ pass: r.ok, detail: "status " + r.status })),
    (e) => console.log(JSON.stringify({ pass: false, detail: String(e.cause ?? e) })))`,
  "blocked host refused (cloudflare.com)": `fetch("https://cloudflare.com/").then(
    (r) => console.log(JSON.stringify({ pass: !r.ok, detail: "status " + r.status })),
    (e) => console.log(JSON.stringify({ pass: true, detail: "refused: " + String(e.cause?.code ?? e) })))`,
  "blocked host refused (1.1.1.1)": `fetch("https://1.1.1.1/").then(
    (r) => console.log(JSON.stringify({ pass: !r.ok, detail: "status " + r.status })),
    (e) => console.log(JSON.stringify({ pass: true, detail: "refused: " + String(e.cause?.code ?? e) })))`,
  "raw TCP refused": `const s = require("node:net").connect(22, "1.1.1.1");
    const done = (pass, detail) => { console.log(JSON.stringify({ pass, detail })); s.destroy(); process.exit(0); };
    s.on("connect", () => done(false, "connected to 1.1.1.1:22"));
    s.on("error", (e) => done(true, "error " + e.code));
    setTimeout(() => done(true, "no connection after 8 s"), 8000);`,
  "DNS for an outside name fails": `require("node:dns").promises.resolve4("cloudflare.com").then(
    (a) => console.log(JSON.stringify({ pass: false, detail: "resolved " + a.length + " address(es)" })),
    (e) => console.log(JSON.stringify({ pass: true, detail: "error " + e.code })))`,
};

/** The container object under test, with a no-op bridge and the check's own outbound entrypoint. */
export class CheckContainerObject extends RunContainerObject {
  protected override outboundHandler(props: ContainerOutboundProps): Fetcher {
    const exports = this.ctx.exports as unknown as {
      CheckOutbound(options: { props: ContainerOutboundProps }): Fetcher;
    };
    return exports.CheckOutbound({ props });
  }

  protected override revokeBridge(): Promise<void> {
    return Promise.resolve();
  }

  /** The network checks, then `destroy()` on the stopped container. */
  async networkChecks(runId: string): Promise<CheckResult[]> {
    await this.begin(setupFor(runId));
    const results: CheckResult[] = [];
    try {
      // `start()` returns before the container is up, and exec() refuses a container that isn't
      // running yet (run 45701542369), so the probes wait for it first.
      const started = await this.#waitUntilRunning();
      results.push(started);
      if (!started.pass) {
        return results;
      }
      for (const [name, script] of Object.entries(PROBES)) {
        results.push(await this.#probe(runId, name, script));
      }
    } finally {
      // Stop the container even when a probe throws, so a retry isn't held by max_instances = 1.
      await this.end(runId);
    }
    results.push(await outcome("destroy() on a stopped container", () => this.end(runId)));
    return results;
  }

  /** `destroy()` straight after `start`, then whether the container is still running. */
  async destroyRightAfterStart(runId: string): Promise<CheckResult> {
    await this.begin(setupFor(runId));
    const result = await outcome("destroy() right after start", () => this.end(runId));
    const running = this.ctx.container?.running ?? false;
    return { ...result, pass: result.pass && !running, detail: `${result.detail}; running ${running}` };
  }

  /** Waits up to {@link startWaitMs} for the container to run; fails if it never does or exits. */
  async #waitUntilRunning(): Promise<CheckResult> {
    const name = "container running after start";
    const startedAt = Date.now();
    while (Date.now() - startedAt < startWaitMs) {
      if (this.ctx.container?.running === true) {
        return { name, pass: true, detail: `running after ${Date.now() - startedAt} ms` };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return { name, pass: false, detail: `not running after ${startWaitMs} ms` };
  }

  async #probe(runId: string, name: string, script: string): Promise<CheckResult> {
    try {
      const process = await this.exec(runId, { program: "node", args: ["-e", script], cwd: "/workspace" });
      const output = process.stdout ? await new Response(process.stdout).text() : "";
      await process.exitCode;
      const parsed = JSON.parse(output.trim().split("\n").pop() ?? "{}") as Partial<CheckResult>;
      return { name, pass: parsed.pass === true, detail: parsed.detail ?? "no output" };
    } catch (error) {
      return { name, pass: false, detail: `probe failed: ${String(error)}` };
    }
  }
}

/** Where the check container's intercepts go: the real gate, with no bridge. */
export class CheckOutbound extends WorkerEntrypoint<CheckEnv, ContainerOutboundProps> {
  override fetch(request: Request): Promise<Response> {
    const gate = outboundGate(this.ctx.props.rules, {
      bridge: () => Promise.resolve(new Response("no bridge", { status: 403 })),
      site: (siteRequest) => fetch(new Request(siteRequest, { redirect: "manual" })),
    });
    return gate(request);
  }
}

function setupFor(runId: string) {
  return {
    runId,
    deadlineMs: Date.now() + 10 * 60_000,
    env: {},
    bridgeHost: null,
    allowedSites: [ALLOWED_SITE],
  };
}

async function outcome(name: string, action: () => Promise<void>): Promise<CheckResult> {
  try {
    await action();
    return { name, pass: true, detail: "no error" };
  } catch (error) {
    return { name, pass: false, detail: String(error) };
  }
}

export default {
  async fetch(request: Request, env: CheckEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/check" || request.headers.get("x-check-token") !== env.CHECK_TOKEN) {
      return new Response("not found", { status: 404 });
    }
    // Each object's name is its run id, as in the Worker.
    const first = `check-${crypto.randomUUID()}`;
    const second = `check-${crypto.randomUUID()}`;
    const objectNamed = (name: string) => env.CHECK_CONTAINER.get(env.CHECK_CONTAINER.idFromName(name));
    const results = [
      ...(await objectNamed(first).networkChecks(first)),
      await objectNamed(second).destroyRightAfterStart(second),
    ];
    const lines = results.map((r) => `${r.pass ? "PASS" : "FAIL"} ${r.name}: ${r.detail}`);
    return new Response(`${lines.join("\n")}\n`);
  },
};
