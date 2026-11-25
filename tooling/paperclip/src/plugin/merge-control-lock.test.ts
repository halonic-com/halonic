import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { fakeState } from "./fake-host.test-helper.ts";
import { type MergeStateClient, mergeControlNamespace, passLock } from "./merge-control-lock.ts";

function key(companyId: string, stateKey = "pass") {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: mergeControlNamespace,
    stateKey,
  } as const;
}

const refused = "Merge control: its state is written only under the pass lock.";

verifies("paperclip.merge-control-pass-lock", () => {
  test("a write to merge control's state outside the pass lock is refused; other state passes", async () => {
    const { state, saved } = fakeState();
    const lock = passLock(state);
    await expect(lock.state.set(key("acme"), { board: "edit" })).rejects.toThrow(refused);
    await lock.state.set({ scopeKind: "company", scopeId: "acme", stateKey: "other" }, 1);
    expect([...saved.values()]).toEqual([1]);
  });

  test("a board edit that starts during a pass waits for it and isn't written over", async () => {
    const { state } = fakeState();
    const lock = passLock(state);
    await lock.run("acme", (client) => client.set(key("acme"), { hold: [] as number[] }));
    let passRead: () => void = () => {};
    const readDone = new Promise<void>((resolve) => {
      passRead = resolve;
    });
    let finishPass: () => void = () => {};
    const passMayWrite = new Promise<void>((resolve) => {
      finishPass = resolve;
    });
    const livePass = lock.run("acme", async (client) => {
      const before = (await client.get(key("acme"))) as { hold: number[] };
      passRead();
      await passMayWrite;
      await client.set(key("acme"), { hold: [...before.hold, 1] });
    });
    await readDone;
    const boardEdit = lock.run("acme", async (client) => {
      const before = (await client.get(key("acme"))) as { hold: number[] };
      await client.set(key("acme"), { hold: [...before.hold, 2] });
    });
    finishPass();
    await Promise.all([livePass, boardEdit]);
    expect(await state.get(key("acme"))).toEqual({ hold: [1, 2] });
  });

  test("the lock's client stops writing once its turn ends, and writes only its own company", async () => {
    const { state } = fakeState();
    const lock = passLock(state);
    let kept: MergeStateClient | undefined;
    await lock.run("acme", async (client) => {
      kept = client;
      await expect(client.set(key("other-co"), 1)).rejects.toThrow(refused);
    });
    await expect(kept?.set(key("acme"), 1)).rejects.toThrow(refused);
  });

  test("a holder that fails still releases the lock", async () => {
    const { state } = fakeState();
    const lock = passLock(state);
    await expect(
      lock.run("acme", async () => {
        throw new Error("pass failed");
      }),
    ).rejects.toThrow("pass failed");
    await lock.run("acme", (client) => client.set(key("acme"), 3));
    expect(await state.get(key("acme"))).toBe(3);
  });
});
