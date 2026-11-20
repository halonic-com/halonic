import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hostLockFile, takeHostLock } from "./host-lock.ts";

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

describe("takeHostLock", () => {
  let profile: string;
  beforeEach(async () => {
    profile = await mkdtemp(join(tmpdir(), "srt-host-lock-"));
  });
  afterEach(async () => {
    await rm(profile, { recursive: true, force: true });
  });

  it("takes the profile's host lock, and removes it when released", async () => {
    const warnings: string[] = [];
    const lock = await takeHostLock(profile, (text) => warnings.push(text));
    expect(lock).not.toBeNull();
    expect(await exists(join(profile, "agent-host", "host.lock"))).toBe(true);
    await lock?.release();
    expect(await exists(hostLockFile(profile))).toBe(false);
    expect(warnings).toEqual([]);
  });

  it("gives null and says why while another live holder has it", async () => {
    const first = await takeHostLock(profile, () => {});
    try {
      const warnings: string[] = [];
      expect(await takeHostLock(profile, (text) => warnings.push(text))).toBeNull();
      expect(warnings.join()).toMatch(
        /^This process doesn't sweep kept grants: The lock .* is held/,
      );
    } finally {
      await first?.release();
    }
  });

  it("gives null and says why when the lock can't be taken", async () => {
    // A file where the lock's folder should be.
    await writeFile(join(profile, "agent-host"), "");
    const warnings: string[] = [];
    expect(await takeHostLock(profile, (text) => warnings.push(text))).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^This process doesn't sweep kept grants: /);
  });
});
