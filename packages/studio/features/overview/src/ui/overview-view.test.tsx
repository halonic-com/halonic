// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { OverviewStore } from "../overview-store.ts";
import { OverviewView } from "./overview-view.tsx";

// Tells React this is a test, so it checks that updates happen inside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

verifies("overview.agents-and-work", () => {
  it("draws agents, idle ones, and blocked work with what it waits on, as plain text", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const chief = messaging.addAgent(acme.id, { name: "Chief", activity: "working" });
    messaging.addAgent(acme.id, { name: "<img src=x onerror=alert(1)>" });
    const logo = messaging.addWork(acme.id, {
      label: "ACME-1",
      title: "Pick a logo",
      assignee: chief.id,
    });
    messaging.addWork(acme.id, {
      label: "ACME-2",
      title: "Print the flyers",
      blockedBy: [logo.id],
    });
    const store = new OverviewStore(messaging);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<OverviewView store={store} />));

    const text = container.textContent ?? "";
    expect(text).toContain("Chief · Paperclip · Acme");
    expect(text).toContain("ACME-1 Pick a logo");
    expect(text).toContain("Idle");
    expect(text).toContain("Waits on ACME-1 Pick a logo");
    expect(container.querySelector("img")).toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
