import { readFileSync } from "node:fs";
import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { artifactSchema } from "@halonicjs/toolscript";
import { expect, it } from "vitest";
import { buildToolScript, verifyArtifact } from "./build.ts";
import { stripTypes } from "./strip-types.ts";

const risks: Record<string, "routine" | "admin" | "irreversible"> = {
  "acme.comment@1": "routine",
  "acme.get-variable@1": "routine",
  "acme.set-variable@1": "admin",
};

const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const options = {
  fileName: "acme.tool.ts",
  riskOf: (reference: string) => risks[reference],
  digest,
};

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}.tool.ts.txt`, import.meta.url), "utf8");
}

async function artifactOf(source: string) {
  const built = await buildToolScript(source, options);
  if (!built.ok) throw new Error(built.problems.map((problem) => problem.message).join("\n"));
  return built.artifact;
}

verifies("toolscript-check.build", () => {
  it("builds the acme example into a valid artifact without types", async () => {
    const artifact = await artifactOf(fixture("acme-sync-release-variables"));
    expect(artifactSchema.safeParse(artifact).success).toBe(true);
    expect(artifact.header.id).toBe("acme.sync-release-variables");
    expect(artifact.profileVersion).toBe(1);
    expect(artifact.code).toContain("export async function run(ctx) {");
    expect(artifact.code).not.toContain("import type");
    expect(artifact.code).not.toContain("UserContext");
    expect(artifact.sourceHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("build-is-reproducible", async () => {
    const source = fixture("acme-sync-release-variables");
    const first = await artifactOf(source);
    const second = await artifactOf(source);
    const fromWindows = await artifactOf(source.replaceAll("\n", "\r\n"));
    expect(second).toEqual(first);
    expect(fromWindows).toEqual(first);
    expect(JSON.stringify(fromWindows)).toBe(JSON.stringify(first));
  });

  it("verifies the code hash, and fails once the code changed", async () => {
    const artifact = await artifactOf(fixture("acme-sync-release-variables"));
    expect(await verifyArtifact(artifact, digest)).toBe(true);
    const changed = { ...artifact, code: `${artifact.code}\nglobalThis.x = 1;` };
    expect(await verifyArtifact(changed, digest)).toBe(false);
  });

  it("builds a declarative script with empty code", async () => {
    const artifact = await artifactOf(fixture("acme-declarative"));
    expect(artifact.code).toBe("");
    expect(await verifyArtifact(artifact, digest)).toBe(true);
  });

  it("doesn't build a script that fails the check", async () => {
    const built = await buildToolScript(fixture("p4-eval"), options);
    expect(built.ok ? [] : built.problems.map((problem) => problem.message)).toEqual([
      "P4: eval is not allowed in a ToolScript",
    ]);
  });

  it("refuses code too long for an artifact", async () => {
    const long = `  const note = "${"a".repeat(200_001)}";\n  await ctx.acme.comment({ task: ctx.input.task, body: note });`;
    const source = fixture("acme-comment-on-task").replace(
      '  await ctx.acme.comment({ task: ctx.input.task, body: "Done." });',
      long,
    );
    const built = await buildToolScript(source, options);
    expect(built.ok).toBe(false);
    expect(built.ok ? [] : built.problems.map((problem) => problem.message)).toEqual([
      expect.stringMatching(/^P6: the built code has \d+ characters, at most 200000$/),
    ]);
  });

  it("strips types on its own, for Studio", () => {
    expect(stripTypes("const n: number = 1;\r\nexport { n };\r\n", "n.tool.ts")).toBe(
      "const n = 1;\nexport { n };\n",
    );
  });
});
