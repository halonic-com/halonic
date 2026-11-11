import type { Runner } from "@halonicjs/adapter-sandbox-srt";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { deniedHost, deniedHostsRunner, lineWatcher } from "./denied-hosts.ts";

/** What the runner is asked to run, and what it gives back: sandbox-srt exports only the `Runner`. */
type RunRequest = Parameters<Runner["run"]>[0];
type RunningProgram = Awaited<ReturnType<Runner["run"]>>;

const encoder = new TextEncoder();

function streamOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

/** A runner that prints `stderr` in the given chunks and notes the request it got. */
function fakeRunner(stderr: readonly string[]): Runner & { requests: RunRequest[] } {
  const requests: RunRequest[] = [];
  return {
    requests,
    async run(request): Promise<RunningProgram> {
      requests.push(request);
      return {
        stdin: new WritableStream(),
        stdout: streamOf([]),
        stderr: streamOf(stderr),
        ended: Promise.resolve({ code: 1, signal: null }),
        killTree: () => {},
      };
    },
  };
}

const request: RunRequest = {
  settingsPath: "<scratch>/srt-settings.json",
  program: "claude",
  args: ["-p"],
  cwd: "<scratch>/work",
  launcherEnv: { PATH: "/usr/bin" },
  programEnv: { PATH: "/usr/bin" },
  withoutSrtEnv: false,
};

verifies("harness-checks.denied-hosts", () => {
  it("reads the host and port of a refused connection", () => {
    expect(
      deniedHost("[SandboxDebug] No matching config rule, denying: platform.claude.com:443"),
    ).toBe("platform.claude.com:443");
    expect(deniedHost("[SandboxDebug] Denied by config rule: auth.openai.com:443\r")).toBe(
      "auth.openai.com:443",
    );
  });

  it("reads nothing from other lines", () => {
    expect(deniedHost("Not logged in · Please run /login")).toBeUndefined();
    expect(deniedHost("[SandboxDebug] Allowed: 127.0.0.1:4100")).toBeUndefined();
  });

  it("turns on the debug log for the launcher only", async () => {
    const base = fakeRunner([]);

    await deniedHostsRunner(base).run(request);

    expect(base.requests[0]?.launcherEnv).toEqual({ PATH: "/usr/bin", SRT_DEBUG: "1" });
    expect(base.requests[0]?.programEnv).toEqual({ PATH: "/usr/bin" });
  });

  it("lists every refusal, repeats included, also when a line comes in two chunks, and passes the output on", async () => {
    const stderr = [
      "[SandboxDebug] No matching config rule, deny",
      "ing: platform.claude.com:443\nLogin expired · Please run /login\n",
      "[SandboxDebug] No matching config rule, denying: platform.claude.com:443\n",
      "[SandboxDebug] No matching config rule, denying: statsig.anthropic.com:443",
    ];
    const runner = deniedHostsRunner(fakeRunner(stderr));

    const program = await runner.run(request);
    const output = await new Response(program.stderr).text();

    expect(output).toBe(stderr.join(""));
    expect(runner.denied).toEqual([
      "platform.claude.com:443",
      "platform.claude.com:443",
      "statsig.anthropic.com:443",
    ]);
  });

  it("hands over a last line without a line break", async () => {
    const lines: string[] = [];

    await new Response(
      streamOf(["one\r\ntw", "o"]).pipeThrough(lineWatcher((line) => lines.push(line))),
    ).text();

    expect(lines).toEqual(["one", "two"]);
  });
});
