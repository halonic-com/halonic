import { readFile } from "node:fs/promises";
import { verifies } from "@halonicjs/testing-spec";
import { beforeAll, describe, expect, it } from "vitest";

const runbookUrl = new URL("../../../../../docs/guides/server-engine.md", import.meta.url);

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

let blocks: CodeBlock[];

beforeAll(async () => {
  blocks = codeBlocks(await readFile(runbookUrl, "utf8"));
});

/** The runbook's one systemd unit. */
function unit(): readonly string[] {
  const units = blocks.filter((block) => block.language === "ini");
  expect(units).toHaveLength(1);
  return units[0]?.lines ?? [];
}

verifies("cli.commands.serve.loopback-runbook", () => {
  describe("the unit", () => {
    it("runs serve on a folder and a port, never on the network or a public origin", () => {
      const starts = unit().filter((line) => line.startsWith("ExecStart="));
      expect(starts).toHaveLength(1);
      const start = starts[0] ?? "";
      expect(start).toMatch(/ apps\/cli\/bin\/halonic\.js serve /u);
      expect(start).toMatch(/ --dir \/\S+/u);
      expect(start).toMatch(/ --port [0-9]+$/u);
      expect(start).not.toMatch(/--network|--public-origin/u);
    });

    it("runs as its own user, private files, loopback traffic only, exit 143 a normal stop", () => {
      expect(unit()).toEqual(
        expect.arrayContaining([
          "User=halonic-engine",
          "UMask=0077",
          "IPAddressDeny=any",
          "IPAddressAllow=localhost",
          "SuccessExitStatus=143",
        ]),
      );
    });

    it("holds no environment, so no password, key or token", () => {
      expect(unit().filter((line) => /^Environment(File)?=/u.test(line))).toEqual([]);
    });
  });

  it("types every secret at the prompt, never as an argument or through a pipe", () => {
    const lines = blocks
      .filter((block) => block.language === "sh")
      .flatMap((block) => block.lines)
      .filter((line) => /\bsecret set\b/u.test(line));
    expect(lines).not.toEqual([]);
    for (const line of lines) expect(line).toMatch(/^\S+ secret set [a-z0-9-]+$/u);
  });

  it("configures no proxy site and no public hostname", () => {
    const code = blocks.flatMap((block) => block.lines).join("\n");
    expect(code).not.toMatch(
      /proxy_pass|reverse_proxy|server_name|--public-origin|https:\/\/(?!github\.com\/)/u,
    );
  });
});
