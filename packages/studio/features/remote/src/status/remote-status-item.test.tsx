// @vitest-environment jsdom

import { FakeRemoteControl } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { remoteContext, settle } from "../test-support/context.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RemoteStatusItem } from "./remote-status-item.tsx";

afterEach(unmountAll);

async function renderItem(remote: FakeRemoteControl | undefined) {
  const opened: (string | undefined)[] = [];
  const context = {
    ...remoteContext(remote),
    openSettings: (section?: string) => opened.push(section),
  };
  const view = render(<RemoteStatusItem context={context} />);
  await settle();
  /** The words on screen, and the dot's look, or `undefined` while there is no item. */
  const shown = () => {
    const button = view.querySelector("button");
    if (button === null) return undefined;
    const words = button.querySelector('[aria-hidden="true"]')?.textContent;
    const dot = button.querySelector("[data-dot]")?.getAttribute("data-dot") ?? "none";
    return { words, dot };
  };
  return { view, opened, shown };
}

verifies("remote.status-item", () => {
  it("shows each of the six states with its dot", async () => {
    const remote = new FakeRemoteControl({ tunnelProviderId: "tailscale" });
    const { shown } = await renderItem(remote);
    expect(shown()).toEqual({ words: "Remote off", dot: "none" });

    await act(() => remote.setRemote(true));
    await settle();
    expect(shown()).toEqual({ words: "Remote on · no phone", dot: "ring" });

    const pixel = remote.addPhone({ name: "Pixel 8" });
    const galaxy = remote.addPhone({ name: "Galaxy S22" });
    await settle();
    expect(shown(), "paired isn't connected").toEqual({
      words: "Remote on · no phone",
      dot: "ring",
    });

    act(() => remote.phoneConnects(pixel.id));
    await settle();
    expect(shown()).toEqual({ words: "Pixel 8 connected", dot: "connected" });

    act(() => remote.phoneConnects(galaxy.id));
    await settle();
    expect(shown()).toEqual({ words: "2 phones connected", dot: "connected" });

    act(() => remote.setTunnel("starting"));
    await settle();
    expect(shown()).toEqual({ words: "Starting remote…", dot: "attention" });

    act(() => remote.setTunnel("degraded", "provider-error"));
    await settle();
    expect(shown()).toEqual({ words: "Remote needs attention", dot: "attention" });

    act(() => remote.setTunnel("down", "signed-out"));
    await settle();
    expect(shown()).toEqual({ words: "Remote needs attention", dot: "attention" });
  });

  it("opens Settings › Remote when pressed, and is no live region", async () => {
    const { view, opened } = await renderItem(new FakeRemoteControl());
    const button = view.querySelector("button");
    act(() => button?.click());

    expect(opened).toEqual(["remote"]);
    expect(view.querySelector("[aria-live], [role=status], [role=alert]")).toBeNull();
  });

  it("is named by its words, with the middle dot read as a comma", async () => {
    const remote = new FakeRemoteControl();
    await remote.setRemote(true);
    const { view } = await renderItem(remote);

    expect(view.querySelector(".sr-only")?.textContent).toBe("Remote on, no phone");
  });

  it("shows nothing while the host doesn't offer remote, or without a host", async () => {
    const remote = new FakeRemoteControl({ available: false });
    const { shown } = await renderItem(remote);
    expect(shown()).toBeUndefined();

    act(() => remote.setAvailable(true));
    await settle();
    expect(shown()).toEqual({ words: "Remote off", dot: "none" });

    expect((await renderItem(undefined)).shown()).toBeUndefined();
  });
});
