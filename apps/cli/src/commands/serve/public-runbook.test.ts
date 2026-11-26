import { readFile } from "node:fs/promises";
import { verifies } from "@halonicjs/testing-spec";
import { beforeAll, describe, expect, it } from "vitest";

const runbookUrl = new URL("../../../../../docs/guides/server-engine-public.md", import.meta.url);
const publicOrigin = "https://engine.<your domain>";

/** A fenced code block of the runbook: its language and its lines. */
interface CodeBlock {
  readonly language: string;
  readonly lines: readonly string[];
}

/** Every fenced code block of `text`, in order. */
function codeBlocks(text: string): CodeBlock[] {
  return [...text.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gmu)].map((match) => ({
    language: match[1] ?? "",
    lines: (match[2] ?? "").split("\n"),
  }));
}

let runbook: string;
let blocks: CodeBlock[];

beforeAll(async () => {
  runbook = await readFile(runbookUrl, "utf8");
  blocks = codeBlocks(runbook);
});

/** The runbook's one systemd override. */
function override(): readonly string[] {
  const overrides = blocks.filter((block) => block.language === "ini");
  expect(overrides).toHaveLength(1);
  return overrides[0]?.lines ?? [];
}

/** The `ExecStart` that runs the server, after the empty one that clears the unit's. */
function start(): string {
  const starts = override().filter((line) => line.startsWith("ExecStart="));
  expect(starts).toHaveLength(2);
  expect(starts[0]).toBe("ExecStart=");
  return starts[1] ?? "";
}

/** The value of one row of the tunnel route's table. */
function routeField(field: string): string {
  const row = runbook.match(new RegExp(`^\\| ${field} \\| \`([^\`]+)\` \\|$`, "mu"));
  expect(row, field).not.toBeNull();
  return row?.[1] ?? "";
}

/** Where a level-2 heading starting with `title` is in the runbook. */
function stepAt(title: string): number {
  const at = runbook.search(new RegExp(`^## ${title}`, "mu"));
  expect(at, title).toBeGreaterThanOrEqual(0);
  return at;
}

verifies("cli.commands.serve.public-runbook", () => {
  describe("the override", () => {
    it("runs serve on a folder, the public name and a port, never on the network", () => {
      const line = start();
      expect(line).toMatch(/ apps\/cli\/bin\/halonic\.js serve /u);
      expect(line).toMatch(/ --dir \/\S+/u);
      expect(line).toContain(` --public-origin ${publicOrigin} `);
      expect(line).toMatch(/ --port [0-9]+$/u);
      expect(line).not.toContain("--network");
    });

    it("holds no environment, so no password, key or token", () => {
      expect(override().filter((line) => /^Environment(File)?=/u.test(line))).toEqual([]);
    });
  });

  it("routes only /api/ to the override's port on loopback", () => {
    const port = start().match(/ --port ([0-9]+)$/u)?.[1];
    expect(routeField("Path")).toBe("^/api/");
    expect(routeField("Service")).toBe(`http://127.0.0.1:${port}`);
  });

  it("puts Access, then the rate limit, then the reviews, before the route that resolves the name", () => {
    const access = stepAt("2\\. Put Access");
    const limit = stepAt("3\\. Limit pairing");
    const reviews = stepAt("4\\. Get both reviews");
    const route = stepAt("5\\. Add the tunnel route");
    expect(access).toBeLessThan(limit);
    expect(limit).toBeLessThan(reviews);
    expect(reviews).toBeLessThan(route);
  });

  it("lets the board in with Allow and the desktops with Service Auth, and bypasses nothing", () => {
    const access = runbook.slice(stepAt("2\\. Put Access"), stepAt("3\\. Limit pairing"));
    expect(access).toMatch(/\*\*Allow\*\*/u);
    expect(access).toMatch(/\*\*Service Auth\*\*/u);
    expect(access).not.toMatch(/\*\*Bypass\*\*/u);
  });

  it("names no real domain in its commands", () => {
    const code = blocks.flatMap((block) => block.lines).join("\n");
    const placeholders = code
      .replaceAll(publicOrigin, "")
      .replace(/https:\/\/github\.com\//gu, "")
      .replace(/http:\/\/(127\.0\.0\.1|<server address>):[0-9]+/gu, "");
    expect(placeholders).not.toMatch(/https?:\/\//u);
    expect(code).not.toMatch(/(?<![\w-])engine\.(?!<your domain>)/u);
  });

  it("sets no secret: the password is part 1's, typed at its prompt", () => {
    const lines = blocks.flatMap((block) => block.lines);
    expect(lines.filter((line) => /\bsecret set\b/u.test(line))).toEqual([]);
  });
});
