// @vitest-environment jsdom

import { FakeRemoteControl } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { remoteContext, settle } from "../test-support/context.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RemoteSection } from "./remote-section.tsx";

afterEach(unmountAll);

async function renderSection(remote: FakeRemoteControl, announced: string[] = []) {
  const context = remoteContext(remote, announced);
  const view = render(
    <RemoteSection
      context={context}
      closeSettings={() => undefined}
      place="app"
      surface="window"
    />,
  );
  await settle();
  const switchNamed = (name: string) => {
    const found = view.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`);
    if (found === null) throw new Error(`No switch is named ${name}`);
    return found;
  };
  const press = async (element: HTMLElement) => {
    act(() => element.click());
    await settle();
  };
  const button = (label: string) =>
    [...view.querySelectorAll("button")].find((found) => found.textContent?.includes(label));
  return { view, switchNamed, press, button };
}

verifies("remote.settings-section", () => {
  it("shows the box and the empty state while remote is off", async () => {
    const { view, switchNamed } = await renderSection(new FakeRemoteControl());

    expect(switchNamed("Let phones reach this computer").checked).toBe(false);
    expect(view.textContent).toContain("Nothing reaches this computer");
    expect(view.textContent).toContain("Off");
    expect(view.querySelector("h3")?.textContent).toBe("No phones paired");
    expect(view.textContent).toContain(
      "Remote is off. Pair a phone to see your agents, approve and send prompts from it.",
    );
    expect(view.textContent).toContain("Shell, files and secrets always stay on this computer.");
  });

  it("turns remote on from its switch, and names the provider and its state", async () => {
    const remote = new FakeRemoteControl({ tunnelProviderId: "tailscale" });
    const { view, switchNamed, press } = await renderSection(remote);

    await press(switchNamed("Let phones reach this computer"));

    expect(remote.snapshot.on).toBe(true);
    expect(switchNamed("Let phones reach this computer").checked).toBe(true);
    expect(view.textContent).toContain("Tailscale");
    expect(view.textContent).toContain("Ready");
    expect(view.textContent).not.toContain("Remote is off.");
  });

  it("lets the risky switch change while remote is off", async () => {
    const remote = new FakeRemoteControl();
    const { switchNamed, press } = await renderSection(remote);

    await press(switchNamed("Let phones answer risky approvals"));

    expect(remote.snapshot.allowRiskyRemotely).toBe(true);
    expect(remote.snapshot.on).toBe(false);
  });

  it("says and announces a switch that failed to change", async () => {
    const remote = new FakeRemoteControl();
    remote.setRemote = () => Promise.reject(new Error("the host didn't answer"));
    const announced: string[] = [];
    const { view, switchNamed, press } = await renderSection(remote, announced);

    await press(switchNamed("Let phones reach this computer"));

    expect(view.textContent).toContain("Couldn't turn remote on. Try again.");
    expect(announced).toEqual(["Couldn't turn remote on. Try again."]);
  });
});

verifies("remote.tunnel-reasons", () => {
  it("shows the tunnel's reason, and Check again turns remote off and on", async () => {
    const remote = new FakeRemoteControl({ tunnelProviderId: "tailscale" });
    remote.failNextStart("signed-out");
    await remote.setRemote(true);
    const { view, button, press } = await renderSection(remote);

    expect(view.textContent).toContain("Tailscale is signed out");
    expect(view.textContent).toContain(
      "Phones can't reach this computer until you sign in to Tailscale on it again. Your agents keep running.",
    );
    expect(view.textContent).toContain("Signed out");
    expect(button("Open Tailscale")).toBeUndefined();

    await press(button("Check again") as HTMLElement);

    expect(view.textContent).not.toContain("Tailscale is signed out");
    expect(view.textContent).toContain("Ready");
  });
});
