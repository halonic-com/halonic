import type {
  BridgeApprovalDecision,
  BridgeApprovalRequest,
  BridgeApprovals,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import {
  askModeApprovals,
  CannotAskError,
  commandCardNote,
  defaultAnswerTimeLimitMs,
  escapeForCard,
  longCommandLength,
} from "./ask-approvals.ts";

const root = "/work/project";
const resolve = async (path: string) => ({ real: path, linked: false });

function person(answer: BridgeApprovalDecision | "never") {
  const asked: BridgeApprovalRequest[] = [];
  const aborted: boolean[] = [];
  const inner: BridgeApprovals = {
    request(request, { signal }) {
      asked.push(request);
      if (answer !== "never") return Promise.resolve(answer);
      return new Promise((_, reject) =>
        signal.addEventListener("abort", () => {
          aborted.push(true);
          reject(new Error("withdrawn"));
        }),
      );
    },
  };
  return { inner, asked, aborted };
}

const timing = {
  timers: {
    set: (callback: () => void, delayMs: number): unknown => setTimeout(callback, delayMs),
    clear: (handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
  newAbortController: () => new AbortController(),
};

const setup = (answer: BridgeApprovalDecision | "never" = { approved: true }) => {
  const who = person(answer);
  const approvals = askModeApprovals({
    inner: who.inner,
    canAsk: true,
    projectRoot: root,
    resolve,
    ...timing,
  });
  return { ...who, approvals };
};
const signal = new AbortController().signal;
const call = (tool: string, args: unknown): BridgeApprovalRequest => ({ callId: "c", tool, args });

afterEach(() => vi.useRealTimers());

verifies("app.ask-approvals", () => {
  it("runs an edit inside the project without asking", async () => {
    const { approvals, asked } = setup();
    expect(
      await approvals.request(call("Edit", { file_path: `${root}/src/a.ts` }), { signal }),
    ).toEqual({ approved: true });
    expect(asked).toEqual([]);
  });

  it("asks for an edit of a protected path and for one outside the project", async () => {
    const { approvals, asked } = setup();
    await approvals.request(call("Write", { file_path: `${root}/.claude/settings.json` }), {
      signal,
    });
    await approvals.request(call("Read", { file_path: "/home/me/.ssh/id" }), { signal }); // leak-guard: allow absolute-path fixture path
    expect(asked).toHaveLength(2);
  });

  it("rejects a device path without asking", async () => {
    const { approvals, asked } = setup();
    const answer = await approvals.request(call("Read", { file_path: "\\\\?\\C:\\x" }), { signal });
    expect(answer.approved).toBe(false);
    expect(asked).toEqual([]);
  });

  it("asks for every command and for any other tool, with the person's answer", async () => {
    const { approvals, asked } = setup({ approved: false, comment: "no" });
    const answer = await approvals.request(call("Bash", { command: "ls" }), { signal });
    expect(answer).toEqual({ approved: false, comment: "no" });
    await approvals.request(call("WebFetch", { url: "https://x.test" }), { signal });
    expect(asked).toHaveLength(2);
  });

  it("shows the whole command, escaped, with the note and no allow-always", async () => {
    const { approvals, asked } = setup();
    await approvals.request(call("Bash", { command: "echo \u202eevil\u0007" }), { signal });
    expect(asked[0]?.args).toEqual({
      command: "echo \\u{202e}evil\\u{0007}",
      note: commandCardNote,
    });
  });

  it("warns for a command over the length limit and still shows all of it", async () => {
    const { approvals, asked } = setup();
    const command = "a".repeat(longCommandLength + 1);
    await approvals.request(call("Bash", { command }), { signal });
    const args = asked[0]?.args as { command: string; warning?: string };
    expect(args.command).toBe(command);
    expect(args.warning).toContain(String(command.length));
  });

  it("keeps line breaks and tabs when escaping", () => {
    expect(escapeForCard("a\n\tb\r")).toBe("a\n\tb\\u{000d}");
  });

  it("escapes tag characters and other invisible ones", () => {
    expect(escapeForCard("a\u{e0041}\u00adb\ufe0f\u3164")).toBe(
      "a\\u{e0041}\\u{00ad}b\\u{fe0f}\\u{3164}",
    );
  });

  it("escapes every string in the args of a call that isn't a command", async () => {
    const { approvals, asked } = setup();
    await approvals.request(
      call("Write", { file_path: `${root}/.claude/settings.json\u202e`, nested: ["x\u0007"] }),
      { signal },
    );
    expect(asked[0]?.args).toEqual({
      file_path: `${root}/.claude/settings.json\\u{202e}`,
      nested: ["x\\u{0007}"],
    });
  });

  it("answers no without asking when the call was already withdrawn", async () => {
    const { approvals, asked } = setup();
    const withdrawn = new AbortController();
    withdrawn.abort();
    expect(
      await approvals.request(call("Bash", { command: "ls" }), { signal: withdrawn.signal }),
    ).toMatchObject({ approved: false });
    expect(asked).toEqual([]);
  });

  it("asks again for the same command: nothing is remembered", async () => {
    const { approvals, asked } = setup();
    await approvals.request(call("Bash", { command: "ls" }), { signal });
    await approvals.request(call("Bash", { command: "ls" }), { signal });
    expect(asked).toHaveLength(2);
  });

  it("answers no and withdraws the question when nobody answers in time", async () => {
    vi.useFakeTimers();
    const { approvals, aborted } = setup("never");
    const pending = approvals.request(call("Bash", { command: "ls" }), { signal });
    await vi.advanceTimersByTimeAsync(defaultAnswerTimeLimitMs - 1);
    expect(aborted).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ approved: false });
    expect(aborted).toEqual([true]);
  });

  it("does not start when nobody can be asked", () => {
    expect(() =>
      askModeApprovals({
        inner: person("never").inner,
        canAsk: false,
        projectRoot: root,
        resolve,
        ...timing,
      }),
    ).toThrow(CannotAskError);
  });
});
