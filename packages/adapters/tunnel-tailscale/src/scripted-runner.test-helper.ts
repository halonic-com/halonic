import type { TailscaleReply, TailscaleRunner } from "./tailscale-runner.ts";

/** The `tailscale status --json` of a node that is signed in and online. */
export const onlineStatus = JSON.stringify({
  BackendState: "Running",
  Self: { DNSName: "studio.tail1234.ts.net.", Online: true },
});

/** The node's tailnet name in {@link onlineStatus}. */
export const nodeName = "studio.tail1234.ts.net";

/** Answers for each command, by its first words; a command with none answers like a healthy node. */
export type Script = Partial<
  Record<"status" | "serve-status" | "serve-add" | "serve-off", TailscaleReply>
>;

const done = (stdout = ""): TailscaleReply => ({ kind: "done", code: 0, stdout, stderr: "" });

/**
 * A {@link TailscaleRunner} that answers from a script and records every
 * argument list it was given, so a test can check what the provider ran.
 * Without a scripted `serve status`, it answers with the entry the last
 * `serve --bg` added, until a `serve … off` removes it, as tailscaled does.
 */
export class ScriptedRunner implements TailscaleRunner {
  readonly calls: string[][] = [];
  script: Script;
  /** When set, `serve --bg` waits for this before it answers. */
  holdAdd: Promise<void> | undefined;
  /** The serve entry added and not yet removed: its `host:port` and the address it proxies to. */
  served: { hostPort: string; target: string } | undefined;

  constructor(script: Script = {}) {
    this.script = script;
  }

  async run(args: readonly string[]): Promise<TailscaleReply> {
    this.calls.push([...args]);
    const kind = kindOf(args);
    if (kind === "serve-add" && this.holdAdd !== undefined) await this.holdAdd;
    const reply = this.script[kind] ?? defaults[kind];
    if (reply.kind === "done" && reply.code === 0) this.#track(kind, args);
    if (kind === "serve-status" && this.script["serve-status"] === undefined) {
      return done(serveConfig(this.served));
    }
    return reply;
  }

  #track(kind: keyof Script, args: readonly string[]): void {
    if (kind === "serve-off") this.served = undefined;
    if (kind !== "serve-add") return;
    const port = args.find((arg) => arg.startsWith("--https="))?.slice("--https=".length);
    this.served = { hostPort: `${nodeName}:${port}`, target: args.at(-1) ?? "" };
  }
}

/** The `tailscale serve status --json` that holds `entry`, or no entry at all. */
export function serveConfig(entry: { hostPort: string; target: string } | undefined): string {
  if (entry === undefined) return "{}";
  return JSON.stringify({
    Web: { [entry.hostPort]: { Handlers: { "/": { Proxy: entry.target } } } },
  });
}

const defaults: Record<keyof Script, TailscaleReply> = {
  status: done(onlineStatus),
  "serve-status": done("{}"),
  "serve-add": done(),
  "serve-off": done(),
};

function kindOf(args: readonly string[]): keyof Script {
  if (args[0] === "status") return "status";
  if (args[1] === "status") return "serve-status";
  if (args.includes("off")) return "serve-off";
  if (args.includes("--bg")) return "serve-add";
  throw new Error(`the scripted runner has no answer for: ${args.join(" ")}`);
}
