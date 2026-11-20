import { createShell } from "@halonicjs/studio-shell";
import { FakeRemoteControl } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { RemoteControlService } from "./api.ts";
import { remoteAvailable, remoteFeature, remoteSummary } from "./feature.ts";
import { remoteContext } from "./test-support/context.ts";

/** Waits for the streams the fake feeds. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("remoteFeature", () => {
  it("is registered under its folder name", () => {
    expect(remoteFeature.id).toBe("remote");
  });

  it("gives its Settings section the remote icon", () => {
    const shell = createShell({ features: [remoteFeature], hostServices: [RemoteControlService] });
    const section = shell.contributions.settings.list().find(({ id }) => id === "remote");
    expect(section?.icon).toBe("remote");
  });
});

verifies("remote.settings-available", () => {
  it("never shows without a RemoteControl", async () => {
    const heard: boolean[] = [];
    const stop = remoteAvailable(remoteContext(undefined), (available) => heard.push(available));
    await flush();
    stop();

    expect(heard).toEqual([]);
  });

  it("follows what the host offers until it is stopped", async () => {
    const remote = new FakeRemoteControl({ available: false });
    const heard: boolean[] = [];
    const stop = remoteAvailable(remoteContext(remote), (available) => heard.push(available));
    await flush();
    remote.setAvailable(true);
    await flush();
    stop();
    remote.setAvailable(false);
    await flush();

    expect(heard).toEqual([false, true]);
  });
});

verifies("remote.settings-section", () => {
  it("sums Remote up as Off, or On with its phones", async () => {
    const remote = new FakeRemoteControl();
    const context = remoteContext(remote);
    expect(await remoteSummary(context)).toBe("Off");

    await remote.setRemote(true);
    expect(await remoteSummary(context)).toBe("On · no phone");

    remote.addPhone({ name: "Pixel 8" });
    expect(await remoteSummary(context)).toBe("On · 1 phone");

    remote.addPhone({ name: "Galaxy S22" });
    expect(await remoteSummary(context)).toBe("On · 2 phones");

    await remote.setRemote(false);
    expect(await remoteSummary(context)).toBe("Off");
    expect(await remoteSummary(remoteContext(undefined))).toBeUndefined();
  });
});
