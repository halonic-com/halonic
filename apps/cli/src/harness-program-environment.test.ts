import { tmpdir } from "node:os";
import { programEnvironment } from "@halonicjs/adapter-harness-kit";
import { createHostSandbox } from "@halonicjs/adapter-sandbox-host";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

verifies("cli.local-harness-host", () => {
  it("gives a harness program the listed variables only, never a token the list doesn't know", async () => {
    const given = programEnvironment({
      PATH: process.env["PATH"],
      LANG: "C.UTF-8",
      EMPTY: "",
      HALONIC_TEST_TOKEN: "not-for-the-harness",
      ANTHROPIC_API_KEY: "not-for-the-harness",
    });
    expect(Object.keys(given).sort()).toEqual(["LANG", "PATH"]);

    // Through the launcher, as an agent on this computer starts: the parent's own token is set too.
    process.env["HALONIC_TEST_TOKEN"] = "not-for-the-harness";
    try {
      const session = await createHostSandbox().open(profileWith({ ...given, TMPDIR: tmpdir() }));
      const program = await session.start({
        program: process.execPath,
        args: ["-e", "process.stdout.write(Object.keys(process.env).join())"],
      });
      const seen = await new Response(program.stdout).text();
      await program.exited;
      await session.close();
      expect(seen).not.toContain("HALONIC_TEST_TOKEN");
      expect(seen).not.toContain("ANTHROPIC_API_KEY");
      expect(seen).toContain("PATH");
    } finally {
      delete process.env["HALONIC_TEST_TOKEN"];
    }
  });
});

function profileWith(env: Record<string, string>): SandboxProfile {
  const folder = tmpdir();
  return {
    workingFolder: folder,
    tempFolder: folder,
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env,
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 30_000,
  };
}
