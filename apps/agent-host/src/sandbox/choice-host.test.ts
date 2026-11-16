import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sandbox } from "@halonicjs/ports";
import { afterEach, describe, expect, it } from "vitest";
import { hostSandboxChoice } from "./choice-host.ts";

/** A sandbox whose own check passes; opening a session is never reached by the unbuilt canary. */
const workingSandbox: Pick<Sandbox, "check" | "open"> = {
  check: async () => ({ ok: true, reason: null, missing: [] }),
  open: async () => {
    throw new Error("not used here");
  },
};

const profiles: string[] = [];

async function profile(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "choice-host-"));
  profiles.push(folder);
  return folder;
}

afterEach(async () => {
  await Promise.all(profiles.splice(0).map((folder) => rm(folder, { recursive: true })));
});

describe("agent-host.sandbox-choice-routes", () => {
  it("fails closed until the real canary exists: the backend is never in use", async () => {
    const choice = hostSandboxChoice(
      { id: "srt", sandbox: workingSandbox },
      await profile(),
      "linux",
    );
    const answer = await choice.start();
    expect(answer.active).toBeNull();
    expect(answer.setting).toBeNull();
    expect(answer.backends).toMatchObject([
      { id: "srt", offered: true, state: "check-failed", reason: "other" },
    ]);
  });

  it("names the backend the launcher says it runs and gives native Windows srt its limits", async () => {
    const wsl = hostSandboxChoice(
      { id: "srt-wsl", sandbox: workingSandbox },
      await profile(),
      "linux",
    );
    expect((await wsl.start()).backends[0]).toMatchObject({
      id: "srt-wsl",
      limits: ["project-folder-writable"],
    });
    const native = hostSandboxChoice(
      { id: "srt", sandbox: workingSandbox },
      await profile(),
      "win32",
    );
    expect((await native.start()).backends[0]?.limits).toContain("schannel-tls-fails");
  });
});
