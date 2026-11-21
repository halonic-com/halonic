import type { BridgeApprovalRequest, BridgeApprovals, SandboxFence } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { PathResolver } from "./ask-policy.ts";
import {
  type InSandboxAllowed,
  type InSandboxSession,
  inSandboxApprovals,
} from "./in-sandbox-approvals.ts";

const root = "/data/proposals/run_1";
const fenced: SandboxFence = { state: "fenced" };

/** Every fence state but `fenced`, and no session at all: none lets anything through. */
const unfenced: [string, InSandboxSession | undefined][] = [
  ["no session yet", undefined],
  ["the launcher's own (Claude Code's own sandbox, or none)", session({ state: "off" })],
  ["a fence that failed its proof", session({ state: "not-fenced", reason: "a probe got in" })],
  ["a closed session", session({ state: "stopped" })],
];

function session(fence: SandboxFence, workingFolder = root): InSandboxSession {
  return { fence, profile: { workingFolder } };
}

/**
 * `..` and `.` folded, then `table`'s links followed: a path under a linked
 * folder resolves to the link's target plus the rest, as the real resolver
 * does for a file that isn't there yet.
 */
function resolverOf(table: Record<string, string> = {}): PathResolver {
  return async (path) => {
    const parts: string[] = [];
    for (const part of path.split("/")) {
      if (part === "..") parts.pop();
      else if (part !== "." && part !== "") parts.push(part);
    }
    let real = `/${parts.join("/")}`;
    for (const [link, target] of Object.entries(table)) {
      if (real === link || real.startsWith(`${link}/`)) real = target + real.slice(link.length);
    }
    return { real, linked: false };
  };
}

/** The approvals for `current`, the calls the inner approvals got, and what was recorded. */
function approvalsFor(current: InSandboxSession | undefined, resolve = resolverOf()) {
  const asked: BridgeApprovalRequest[] = [];
  const recorded: InSandboxAllowed[] = [];
  const inner: BridgeApprovals = {
    request: async (request) => {
      asked.push(request);
      return { approved: false, comment: "Refused: nobody can answer." };
    },
  };
  const approvals = inSandboxApprovals({
    inner,
    session: () => current,
    resolve,
    record: async (allowed) => {
      recorded.push(allowed);
    },
  });
  const ask = (tool: string, args: unknown) =>
    approvals.request({ callId: "c1", tool, args }, { signal: new AbortController().signal });
  return { ask, asked, recorded };
}

/** The calls the policy lets through inside the fence. */
const letThrough: [string, string, unknown, string][] = [
  ["an edit inside", "Edit", { file_path: `${root}/src/a.ts` }, `${root}/src/a.ts`],
  ["a new file inside", "Write", { file_path: `${root}/notes/new.md` }, `${root}/notes/new.md`],
  ["a read inside", "Read", { file_path: `${root}/README.md` }, `${root}/README.md`],
  ["a search inside", "Grep", { path: `${root}/src` }, `${root}/src`],
  ["a command", "Bash", { command: "npm test" }, "npm test"],
  ["its to-do list", "TodoWrite", { todos: [] }, ""],
];

/** The calls it passes to the inner approvals even inside the fence. */
const passedOn: [string, string, unknown][] = [
  ["an edit outside", "Edit", { file_path: "/data/other/a.ts" }],
  ["`..` that leaves the folder", "Edit", { file_path: `${root}/../run_2/a.ts` }],
  ["a relative path", "Edit", { file_path: "src/a.ts" }],
  ["an edit of .git/config", "Edit", { file_path: `${root}/.git/config` }],
  ["an edit of a nested .git", "Write", { file_path: `${root}/vendor/lib/.git/hooks/pre-commit` }],
  ["an edit of .claude/", "Edit", { file_path: `${root}/.claude/settings.json` }],
  ["a device path", "Read", { file_path: "//./PhysicalDrive0" }],
  ["a UNC path", "Write", { file_path: "//server/share/a.txt" }],
  ["a Windows device path", "Read", { file_path: "\\\\.\\PhysicalDrive0" }],
  ["a Windows UNC path", "Write", { file_path: "\\\\server\\share\\a.txt" }],
  ["another MCP server's tool", "mcp__mail__send", { to: "sam@acme.test" }],
  ["a sub-agent", "Task", { prompt: "Fix it" }],
  ["a web fetch", "WebFetch", { url: "https://example.com" }],
  ["a command without a command", "Bash", { cmd: "ls" }],
];

verifies("app.in-sandbox-approvals", () => {
  describe("inside the fence", () => {
    it.each(letThrough)(
      "approves %s without asking, and records it first",
      async (_what, tool, args, detail) => {
        const { ask, asked, recorded } = approvalsFor(session(fenced));

        expect(await ask(tool, args)).toEqual({ approved: true });
        expect(asked).toEqual([]);
        expect(recorded).toEqual([{ tool, detail }]);
      },
    );

    it.each(passedOn)("passes %s to the run's approvals, as it came", async (_what, tool, args) => {
      const { ask, asked, recorded } = approvalsFor(session(fenced));

      expect(await ask(tool, args)).toEqual({
        approved: false,
        comment: "Refused: nobody can answer.",
      });
      expect(asked).toEqual([{ callId: "c1", tool, args }]);
      expect(recorded).toEqual([]);
    });

    it("passes on a new file whose folder is a link that leads outside", async () => {
      const resolve = resolverOf({ [`${root}/out`]: "/home/sam/.ssh" }); // leak-guard: allow absolute-path fixture path
      const { ask, asked } = approvalsFor(session(fenced), resolve);

      expect((await ask("Write", { file_path: `${root}/out/config` })).approved).toBe(false);
      expect(asked).toHaveLength(1);
    });

    it("follows the working folder's own link, and compares real paths", async () => {
      const resolve = resolverOf({ "/proposals": root });
      const { ask } = approvalsFor(session(fenced, "/proposals"), resolve);

      expect((await ask("Edit", { file_path: `${root}/src/a.ts` })).approved).toBe(true);
    });

    it("passes on a call when a path can't be resolved", async () => {
      const { ask, asked } = approvalsFor(session(fenced), async () => null);

      expect((await ask("Edit", { file_path: `${root}/src/a.ts` })).approved).toBe(false);
      expect(asked).toHaveLength(1);
    });

    it("cuts a long command at 2,000 characters in the record", async () => {
      const { ask, recorded } = approvalsFor(session(fenced));
      await ask("Bash", { command: "x".repeat(2500) });

      expect(recorded[0]?.detail).toHaveLength(2000);
    });

    it("passes the call on, unapproved, when the record can't be written", async () => {
      const asked: string[] = [];
      const approvals = inSandboxApprovals({
        inner: { request: async (request) => (asked.push(request.tool), { approved: false }) },
        session: () => session(fenced),
        resolve: resolverOf(),
        record: async () => {
          throw new Error("The run log is full.");
        },
      });
      const signal = new AbortController().signal;

      expect(
        await approvals.request(
          { callId: "c1", tool: "Bash", args: { command: "ls" } },
          { signal },
        ),
      ).toEqual({
        approved: false,
      });
      expect(asked).toEqual(["Bash"]);
    });

    it("passes on a path call when the session closes while its path is resolved", async () => {
      let current: InSandboxSession | undefined = session(fenced);
      const resolve: PathResolver = async (path) => {
        if (path !== root) current = session({ state: "stopped" });
        return { real: path, linked: false };
      };
      const approvals = inSandboxApprovals({
        inner: { request: async () => ({ approved: false }) },
        session: () => current,
        resolve,
        record: async () => undefined,
      });
      const signal = new AbortController().signal;

      expect(
        (
          await approvals.request(
            { callId: "c1", tool: "Edit", args: { file_path: `${root}/a.ts` } },
            { signal },
          )
        ).approved,
      ).toBe(false);
    });
  });

  describe.each(unfenced)("with %s", (_state, current) => {
    const everyCall: [string, string, unknown][] = [
      ...letThrough.map(([what, tool, args]): [string, string, unknown] => [what, tool, args]),
      ...passedOn,
    ];
    it.each(everyCall)("passes %s to the run's approvals", async (_what, tool, args) => {
      const { ask, asked, recorded } = approvalsFor(current);

      expect((await ask(tool, args)).approved).toBe(false);
      expect(asked).toEqual([{ callId: "c1", tool, args }]);
      expect(recorded).toEqual([]);
    });
  });
});
