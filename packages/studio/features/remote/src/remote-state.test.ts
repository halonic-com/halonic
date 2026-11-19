import type { RemoteControl, RemoteState } from "@halonicjs/ports";
import { FakeRemoteControl } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { followRemote, remoteNow } from "./remote-state.ts";

/** A host whose state stream fails, or ends, before its first snapshot. */
function brokenRemote(how: "fails" | "ends"): RemoteControl {
  const remote = new FakeRemoteControl();
  remote.state = () => ({
    [Symbol.asyncIterator]: () => ({
      next: () =>
        how === "fails"
          ? Promise.reject(new Error("the host went away"))
          : Promise.resolve({ done: true as const, value: undefined }),
    }),
  });
  return remote;
}

verifies("remote.settings-section", () => {
  it("reads the host's state now, and says why it can't", async () => {
    const remote = new FakeRemoteControl();
    await remote.setRemote(true);

    expect((await remoteNow(remote)).on).toBe(true);
    await expect(remoteNow(brokenRemote("fails"))).rejects.toThrow("the host went away");
    await expect(remoteNow(brokenRemote("ends"))).rejects.toThrow("ended before it began");
  });

  it("stops following when asked, so no later snapshot arrives", async () => {
    const remote = new FakeRemoteControl();
    const seen: RemoteState[] = [];
    const stop = followRemote(remote, (state) => seen.push(state));
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
    await remote.setRemote(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen.map((state) => state.on)).toEqual([false]);
  });
});
