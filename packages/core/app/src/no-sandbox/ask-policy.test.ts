import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type AskToolCall, askPolicy, type PathResolver, type ResolvedPath } from "./ask-policy.ts";

const root = "/work/project";
const SSH_KEY = "/home/me/.ssh/id"; // leak-guard: allow absolute-path fixture path
const WIN_USER = "C:\\Users\\me"; // leak-guard: allow absolute-path fixture path
const identity: PathResolver = async (path) => ({ real: path, linked: false });
const mapped =
  (table: Record<string, ResolvedPath | null>): PathResolver =>
  async (path) =>
    path in table ? (table[path] ?? null) : { real: path, linked: false };

const run = (call: AskToolCall, resolve: PathResolver = identity, windows = false) =>
  askPolicy(call, { projectRoot: root, resolve, windows });
const edit = (path: string): AskToolCall => ({ kind: "edit", path });
const read = (path: string): AskToolCall => ({ kind: "read", path });

verifies("app.ask-policy", () => {
  describe("what it lets through", () => {
    it("allows a read and an edit inside the project", async () => {
      expect(await run(read(`${root}/src/a.ts`))).toEqual({ decision: "allow" });
      expect(await run(edit(`${root}/src/new.ts`))).toEqual({ decision: "allow" });
    });

    it("allows reading a protected path, which plants nothing", async () => {
      expect(await run(read(`${root}/.git/config`))).toEqual({ decision: "allow" });
    });
  });

  describe("what it always asks", () => {
    it("asks for every shell command, also a harmless one", async () => {
      expect(await run({ kind: "shell", command: "ls" })).toEqual({
        decision: "ask",
        reason: "shell-command",
      });
    });

    it("asks for any other tool", async () => {
      expect(await run({ kind: "other", name: "WebFetch" })).toEqual({
        decision: "ask",
        reason: "other-tool",
      });
    });

    it("asks for a relative path", async () => {
      expect(await run(edit("src/a.ts"))).toEqual({ decision: "ask", reason: "relative-path" });
    });

    it.each([
      ".git/hooks/pre-commit",
      "sub/.git/config",
      ".claude/settings.json",
      ".claude/notes.md",
      ".mcp.json",
      ".vscode/tasks.json",
      ".envrc",
      ".codex/config.toml",
    ])("asks for an edit of %s inside the project", async (name) => {
      expect(await run(edit(`${root}/${name}`))).toEqual({
        decision: "ask",
        reason: "protected-path",
      });
    });

    it("asks for a path outside the project, and for one that only starts like it", async () => {
      expect(await run(read(SSH_KEY))).toEqual({
        decision: "ask",
        reason: "outside-project",
      });
      expect(await run(edit("/work/project-other/a"))).toEqual({
        decision: "ask",
        reason: "outside-project",
      });
    });
  });

  describe("paths that only look inside the project", () => {
    it("asks when a link inside leads outside", async () => {
      const resolve = mapped({
        [`${root}/docs/key`]: { real: "/home/me/.ssh/id", linked: false }, // leak-guard: allow absolute-path fixture path
      });
      expect(await run(read(`${root}/docs/key`), resolve)).toEqual({
        decision: "ask",
        reason: "outside-project",
      });
    });

    it("asks when a link leads to a protected file inside the project", async () => {
      const resolve = mapped({
        [`${root}/innocent`]: { real: `${root}/.git/hooks/pre-commit`, linked: false },
      });
      expect(await run(edit(`${root}/innocent`), resolve)).toEqual({
        decision: "ask",
        reason: "protected-path",
      });
    });

    it("asks for a `..` that climbs out of the project once resolved", async () => {
      const resolve = mapped({ [`${root}/a/../../x`]: { real: "/work/x", linked: false } });
      expect((await run(read(`${root}/a/../../x`), resolve)).decision).toBe("ask");
    });

    it("asks for a file with more than one name, for a read too", async () => {
      const resolve = mapped({ [`${root}/copy`]: { real: `${root}/copy`, linked: true } });
      expect(await run(read(`${root}/copy`), resolve)).toEqual({
        decision: "ask",
        reason: "linked-file",
      });
      expect(await run(edit(`${root}/copy`), resolve)).toEqual({
        decision: "ask",
        reason: "linked-file",
      });
    });

    it("asks, and never allows, when the resolver can't tell or throws", async () => {
      const unknown = mapped({ [`${root}/loop`]: null });
      expect(await run(read(`${root}/loop`), unknown)).toEqual({
        decision: "ask",
        reason: "unresolved",
      });
      const broken: PathResolver = async () => {
        throw new Error("boom");
      };
      expect(await run(edit(`${root}/a`), broken)).toEqual({
        decision: "ask",
        reason: "unresolved",
      });
    });

    it("compares the project by whole segments", async () => {
      const resolve = mapped({ [`${root}/x`]: { real: "/work/project2/x", linked: false } });
      expect((await run(read(`${root}/x`), resolve)).decision).toBe("ask");
    });
  });

  it("asks for an edit of .Claude/settings.json without ignoreCase, as macOS would read it", async () => {
    expect(await run(edit(`${root}/.Claude/settings.json`), identity, false)).toEqual({
      decision: "ask",
      reason: "protected-path",
    });
  });

  it("asks for everything when the project root has no segments", async () => {
    const verdict = await askPolicy(edit("/a.ts"), { projectRoot: "/", resolve: identity });
    expect(verdict).toEqual({ decision: "ask", reason: "outside-project" });
  });

  describe("on Windows", () => {
    const windowsRoot = `${WIN_USER}\\project`; // leak-guard: allow absolute-path fixture path
    const win = (call: AskToolCall, resolve: PathResolver = identity) =>
      askPolicy(call, { projectRoot: windowsRoot, resolve, windows: true });

    it.each([
      ["\\\\?\\C:\\Users\\me\\project\\a", "device-path"],
      ["\\\\.\\PhysicalDrive0", "device-path"],
      ["//?/C:/Users/me/project/a", "device-path"], // leak-guard: allow absolute-path fixture path
      ["\\\\server\\share\\a", "network-path"],
      ["C:\\Users\\me\\project\\a.txt:hidden", "alternate-stream"], // leak-guard: allow absolute-path fixture path
      ["C:\\Users\\me\\project\\dir::$INDEX_ALLOCATION", "alternate-stream"], // leak-guard: allow absolute-path fixture path
    ])("refuses %s", async (path, reason) => {
      expect(await win(edit(path))).toEqual({ decision: "refuse", reason });
    });

    it("asks for a short name the resolver left alone", async () => {
      expect(await win(read(`${WIN_USER}\\PROJEC~1\\a`))).toEqual({
        decision: "ask",
        reason: "short-name",
      });
    });

    it("ignores letter case, in the project and in the protected list", async () => {
      expect(await win(edit("c:\\users\\ME\\Project\\src\\a.ts"))).toEqual({ decision: "allow" }); // leak-guard: allow absolute-path fixture path
      expect(await win(edit(`${windowsRoot}\\.GIT\\config`))).toEqual({
        decision: "ask",
        reason: "protected-path",
      });
    });

    it("asks for a segment that ends in a dot or a space, which Win32 drops", async () => {
      for (const path of [
        `${windowsRoot}\\.claude.\\settings.json`,
        `${windowsRoot}\\.git \\hooks\\x`,
      ]) {
        expect(await win(edit(path))).toEqual({ decision: "ask", reason: "trailing-dot-or-space" });
      }
    });

    it("keeps a colon in a POSIX name a plain name", async () => {
      expect(await run(edit(`${root}/a:b`))).toEqual({ decision: "allow" });
    });
  });
});
