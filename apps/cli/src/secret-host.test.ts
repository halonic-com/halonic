import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { chainedSecrets, openSecretStore } from "./secret-host.ts";

let folder: string;
const profile = () => ({
  platform: process.platform,
  homeFolder: folder,
  variables: { HALONIC_HOME: join(folder, "profile") },
});

beforeEach(async () => {
  // realpath: Windows hands out 8.3 short temp paths (RUNNER~1), which HALONIC_HOME rejects.
  folder = await realpath(await mkdtemp(join(tmpdir(), "halonic-secret-chain-")));
});

afterEach(() => rm(folder, { recursive: true, force: true }));

verifies("cli.secret-chain", () => {
  it("reads the environment first, then the secrets file, then nothing", async () => {
    await openSecretStore(profile()).set("openai", "from-file");
    await openSecretStore(profile()).set("anthropic", "from-file");
    const secrets = chainedSecrets({ HALONIC_SECRET_OPENAI: "from-env" }, profile);

    expect(await secrets.get("openai")).toBe("from-env");
    expect(await secrets.get("anthropic")).toBe("from-file");
    expect(await secrets.get("google")).toBeNull();
  });

  it("opens the file only for a name the environment doesn't have", async () => {
    const secrets = chainedSecrets({ HALONIC_SECRET_OPENAI: "from-env" }, () => {
      throw new Error("the profile folder can't be found");
    });

    expect(await secrets.get("openai")).toBe("from-env");
    await expect(secrets.get("anthropic")).rejects.toThrow("the profile folder can't be found");
  });
});
