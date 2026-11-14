import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { DeployLease } from "./api.ts";
import { type DeployError, DeployLockedError } from "./errors.ts";
import { fakeCloudflareApi } from "./fake-api.ts";
import { withDeployLock } from "./lock.ts";

const minute = 60_000;
const other: DeployLease = {
  id: "other",
  label: "ana on build box",
  startedAt: 1_000,
  expiresAt: 1_000 + 10 * minute,
};

function setup(clock: { t: number }, state: Parameters<typeof fakeCloudflareApi>[0]) {
  const api = fakeCloudflareApi({ now: () => clock.t, ...state });
  const ticks: (() => void)[] = [];
  const intervals: number[] = [];
  const options = {
    accountId: "a1",
    worker: "halonic-dev",
    label: "mateo on laptop",
    id: "mine",
    now: () => clock.t,
    schedule: (run: () => void, ms: number) => {
      intervals.push(ms);
      ticks.push(run);
      return () => ticks.splice(0);
    },
  };
  return { api, options, ticks, intervals };
}

verifies("deploy.lock", () => {
  it("takes the lock, runs, and frees it", async () => {
    const { api, options } = setup({ t: 5_000 }, { accounts: [] });
    expect(await withDeployLock(api, options, async () => "done")).toBe("done");
    expect(api.calls).toEqual(["takeDeployLock mine", "releaseDeployLock mine"]);
  });

  it("stops a second deploy with the holder and start time, and changes nothing", async () => {
    const { api, options } = setup({ t: 5_000 }, { accounts: [], lock: other });
    let ran = false;
    const error = await withDeployLock(api, options, async () => {
      ran = true;
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeployLockedError);
    expect((error as DeployLockedError).code).toBe("deploy-locked");
    expect((error as DeployLockedError).holder).toBe("ana on build box");
    expect((error as DeployLockedError).startedAt).toBe(1_000);
    expect((error as Error).message).toContain("ana on build box");
    expect(ran).toBe(false);
    // The other deploy's lease is still there: we never renewed or released it.
    expect(api.calls).toEqual(["takeDeployLock mine"]);
  });

  it("takes over a lease that has expired", async () => {
    const { api, options } = setup({ t: other.expiresAt + 1 }, { accounts: [], lock: other });
    expect(await withDeployLock(api, options, async () => "ok")).toBe("ok");
  });

  it("does not take a lease in its last millisecond", async () => {
    const { api, options } = setup({ t: other.expiresAt - 1 }, { accounts: [], lock: other });
    await expect(withDeployLock(api, options, async () => "ok")).rejects.toBeInstanceOf(
      DeployLockedError,
    );
  });

  it("renews at each step and in the background during a long step", async () => {
    const clock = { t: 0 };
    const { api, options, ticks, intervals } = setup(clock, { accounts: [] });
    await withDeployLock(api, options, async (lock) => {
      expect(intervals).toEqual([(10 * minute) / 3]);
      clock.t += 4 * minute;
      await lock.renew();
      clock.t += 4 * minute;
      ticks[0]?.();
      await Promise.resolve();
    });
    expect(api.calls.filter((c) => c.startsWith("renew"))).toHaveLength(2);
    expect(api.calls.at(-1)).toBe("releaseDeployLock mine");
  });

  it("stops when another deploy took the lock over mid-run", async () => {
    const clock = { t: 0 };
    const { api, options } = setup(clock, { accounts: [] });
    const error = await withDeployLock(api, options, async (lock) => {
      // The lease ran out unseen and another deploy took it.
      clock.t += 11 * minute;
      await api.takeDeployLock("a1", "halonic-dev-data", { ...other, leaseMs: minute });
      await lock.renew();
    }).catch((e: unknown) => e);
    expect((error as DeployError).code).toBe("deploy-lock-lost");
    // Releasing with our id must not free the other deploy's lease.
    const again = await api.takeDeployLock("a1", "halonic-dev-data", {
      ...other,
      id: "third",
      leaseMs: minute,
    });
    expect(again.id).toBe("other");
  });

  it("fails a deploy whose background renewal found the lease lost", async () => {
    const clock = { t: 0 };
    const { api, options, ticks } = setup(clock, { accounts: [] });
    const error = await withDeployLock(api, options, async () => {
      clock.t += 11 * minute;
      await api.takeDeployLock("a1", "halonic-dev-data", { ...other, leaseMs: minute });
      ticks[0]?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return "finished";
    }).catch((e: unknown) => e);
    expect((error as DeployError).code).toBe("deploy-lock-lost");
  });

  it("survives a failed background renewal while the lease is still ours, and frees the lock", async () => {
    const clock = { t: 0 };
    const state = { accounts: [], renewFails: false };
    const { api, options, ticks } = setup(clock, state);
    const result = await withDeployLock(api, options, async (lock) => {
      clock.t += 3 * minute;
      state.renewFails = true;
      ticks[0]?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await lock.renew();
      state.renewFails = false;
      return "finished";
    });
    expect(result).toBe("finished");
    expect(api.calls.at(-1)).toBe("releaseDeployLock mine");
  });

  it("gives up once renewals have failed until the last confirmed expiry", async () => {
    const clock = { t: 0 };
    const state = { accounts: [], renewFails: true };
    const { api, options } = setup(clock, state);
    const error = await withDeployLock(api, options, async (lock) => {
      clock.t += 10 * minute;
      await lock.renew();
    }).catch((e: unknown) => e);
    expect((error as DeployError).code).toBe("deploy-lock-lost");
  });

  it("decides expiry by the database's clock, not the deploying machine's", async () => {
    // This machine's clock is an hour ahead of the database's, so the lease isn't expired.
    const { api, options } = setup({ t: 0 }, { accounts: [], lock: other, now: () => 2_000 });
    await expect(
      withDeployLock(api, { ...options, now: () => 60 * minute }, async () => "ok"),
    ).rejects.toBeInstanceOf(DeployLockedError);
  });

  it("frees the lock when the deploy throws, and keeps the deploy's error", async () => {
    const { api, options } = setup({ t: 0 }, { accounts: [] });
    await expect(
      withDeployLock(api, options, async () => {
        throw new Error("upload failed");
      }),
    ).rejects.toThrow("upload failed");
    expect(api.calls.at(-1)).toBe("releaseDeployLock mine");
  });

  it("frees the lock when Ctrl C aborts the deploy, and stops renewing", async () => {
    const controller = new AbortController();
    const { api, options } = setup({ t: 0 }, { accounts: [] });
    const run = withDeployLock(api, { ...options, signal: controller.signal }, async (lock) => {
      const stopped = new Promise<void>((resolve) =>
        controller.signal.addEventListener("abort", () => resolve()),
      );
      controller.abort();
      await stopped;
      await lock.renew();
      throw new Error("interrupted");
    });
    await expect(run).rejects.toThrow("interrupted");
    expect(api.calls).toEqual(["takeDeployLock mine", "releaseDeployLock mine"]);
  });

  it("is a write, so a mode that must write nothing can't take it", async () => {
    const { api, options } = setup({ t: 0 }, { accounts: [], failOnWrite: true });
    await expect(withDeployLock(api, options, async () => "x")).rejects.toThrow(/unexpected write/);
  });
});
