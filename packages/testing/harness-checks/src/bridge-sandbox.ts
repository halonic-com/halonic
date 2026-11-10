import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type Fetch, NodeHarnessBridgeServer } from "@halonicjs/adapter-harness-bridge";
import { type Runner, SrtSandbox, srtRunner } from "@halonicjs/adapter-sandbox-srt";
import type {
  BridgeProvider,
  HarnessBridge,
  HarnessBridgeOptions,
  OpenHarnessBridge,
  Sandbox,
  SandboxCommand,
  SandboxExit,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { deniedHostsRunner } from "./denied-hosts.ts";
import { type HeaderTap, openHeaderTap, type TappedRequest } from "./header-tap.ts";

/** The folders of the sandbox profile a harness's environment may point at. */
export type CheckFolders = Pick<SandboxProfile, "workingFolder" | "tempFolder" | "settingsFolder">;

/** What {@link openBridgeSandbox} needs. */
export interface BridgeSandboxOptions {
  /** The provider the agent signs in to with the person's own subscription. */
  provider: BridgeProvider;
  /** The request headers the report says were sent or not, such as `authorization`. */
  watched: readonly string[];
  /** The harness's own variables, as its adapter makes them. */
  environment(bridge: HarnessBridge, folders: CheckFolders): Record<string, string>;
  /** The agent's settings folder, where the person signed in. */
  settingsFolder: string;
  /** A folder of the check's own; the working and temp folders go inside it. */
  scratchFolder: string;
  /** Sites beyond the bridge the program may reach. Empty for the main check. */
  allowedSites: readonly string[];
  /** More variables for the program, such as `CLAUDE_CODE_OAUTH_TOKEN`. */
  extraEnv?: Readonly<Record<string, string>>;
  /** The sandbox, given the runner that reads refused hosts; srt unless a test gives another. */
  sandbox?: (runner: Runner) => Sandbox;
  /** How the bridge calls the provider; Node's own `fetch` unless a test gives another. */
  fetch?: Fetch;
}

/** How one program ended, with its output for the check to read. */
export interface CheckedRun {
  /** How it ended; `timedOut` when the check stopped it. */
  exit: SandboxExit & { timedOut: boolean };
  /**
   * What it printed. Kept in memory for the check to read one fact from,
   * such as `loggedIn`; never printed, because it can name the person's account.
   */
  stdout: string;
  stderr: string;
}

/** The bridge, its tap and a sandbox that reaches only the tap: one check's setup. */
export interface BridgeSandbox {
  /**
   * The bridge's address as the harness sees it: the tap's. For a harness
   * that takes it as an argument, such as Codex's `-c` settings.
   */
  readonly bridgeUrl: string;
  /** Runs one program in the sandbox, with standard input closed, and stops it after `timeoutMs`. */
  run(command: SandboxCommand, timeoutMs: number): Promise<CheckedRun>;
  /** The requests the tap passed on to the bridge so far. */
  readonly requests: readonly TappedRequest[];
  /** The `host:port` of each connection the sandbox refused so far. */
  readonly denied: readonly string[];
  /** How many model calls the bridge answered and recorded. */
  readonly modelCalls: number;
  close(): Promise<void>;
}

/** How long the sandbox may stay open for one check. */
const sessionTimeLimitMs = 15 * 60_000;

/**
 * Opens the run's real bridge, set up for a subscription, with a header tap
 * in front of it and an srt sandbox whose only reachable address is the tap
 * (plus `allowedSites`). The harness's environment names the tap as the
 * bridge, so every request the program makes to the bridge passes the tap.
 *
 * @throws when the sandbox can't start on this computer
 */
export async function openBridgeSandbox(options: BridgeSandboxOptions): Promise<BridgeSandbox> {
  const recorded = { modelCalls: 0 };
  const server = new NodeHarnessBridgeServer({
    // A subscription never needs a key, so the bridge finds none.
    secrets: { get: async () => null },
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const bridge = await server.open(subscriptionRun(options.provider, recorded));
  const closing: (() => Promise<void>)[] = [() => bridge.close()];
  try {
    const tap = await openHeaderTap({ bridgeUrl: bridge.url, watched: options.watched });
    closing.unshift(() => tap.close());
    const runner = deniedHostsRunner(srtRunner);
    const sandbox = options.sandbox ?? ((given: Runner) => new SrtSandbox(undefined, given));
    const session = await sandbox(runner).open(await checkProfile(options, bridge, tap));
    closing.unshift(() => session.close());
    return {
      bridgeUrl: tap.url,
      run: (command, timeoutMs) => runChecked(session, command, timeoutMs),
      requests: tap.requests,
      denied: runner.denied,
      get modelCalls() {
        return recorded.modelCalls;
      },
      close: () => closeAll(closing),
    };
  } catch (error) {
    await closeAll(closing);
    throw error;
  }
}

/** A run of the bridge for one agent that signs in to `provider` and has no Halonic tools. */
function subscriptionRun(
  provider: BridgeProvider,
  recorded: { modelCalls: number },
): HarnessBridgeOptions {
  const noTools = async (): Promise<never> => {
    throw new Error("The sign-in check offers no Halonic tools.");
  };
  return {
    runId: "run_harness_check",
    agentId: "harness-check",
    providers: { [provider]: { kind: "sign-in" } },
    price: () => null,
    recorder: {
      record: async (event) => {
        if (event.type === "llm.response") recorded.modelCalls += 1;
      },
    },
    tools: { list: async () => [], check: noTools, call: noTools },
    approvals: { request: noTools },
  };
}

/** The sandbox profile: the tap is the bridge, and the harness's variables point at the check's folders. */
async function checkProfile(
  options: BridgeSandboxOptions,
  bridge: OpenHarnessBridge,
  tap: HeaderTap,
): Promise<SandboxProfile> {
  const folders: CheckFolders = {
    workingFolder: join(options.scratchFolder, "work"),
    tempFolder: join(options.scratchFolder, "temp"),
    settingsFolder: options.settingsFolder,
  };
  const home = join(folders.workingFolder, "home");
  await mkdir(home, { recursive: true });
  await mkdir(folders.tempFolder, { recursive: true });
  return {
    ...folders,
    readOnlyPaths: [],
    deniedPaths: [],
    env: {
      // The engine gives every agent a home of its own, never the person's.
      HOME: home,
      ...options.environment({ url: tap.url, token: bridge.token }, folders),
      ...options.extraEnv,
    },
    network: {
      bridge: { host: tap.host, port: tap.port },
      allowedSites: [...options.allowedSites],
    },
    timeLimitMs: sessionTimeLimitMs,
  };
}

async function runChecked(
  session: SandboxSession,
  command: SandboxCommand,
  timeoutMs: number,
): Promise<CheckedRun> {
  const started = await session.start(command);
  await started.stdin.close();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void started.kill();
  }, timeoutMs);
  try {
    const [stdout, stderr, exit] = await Promise.all([
      new Response(started.stdout).text(),
      new Response(started.stderr).text(),
      started.exited,
    ]);
    return { exit: { ...exit, timedOut }, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

/** Closes each part, newest first, and still closes the rest when one fails. */
async function closeAll(closing: readonly (() => Promise<void>)[]): Promise<void> {
  const results = [];
  for (const close of closing)
    results.push(
      await close().then(
        () => null,
        (error) => error,
      ),
    );
  const failed = results.find((result) => result !== null);
  if (failed !== undefined) throw failed;
}
