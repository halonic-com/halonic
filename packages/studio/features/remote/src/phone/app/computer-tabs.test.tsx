// @vitest-environment jsdom

import type { InboxItem } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../../test-support/render.tsx";
import { ComputerTabs } from "./computer-tabs.tsx";

afterEach(() => unmountAll());

function card(id: string): InboxItem {
  return {
    id,
    source: "acme",
    from: { kind: "agent", agent: "chief", name: "Chief" },
    question: "Ship phase 2 now?",
    options: [],
    attachments: [],
    createdAt: "2026-11-25T14:00:00.000Z",
    state: { kind: "open" },
  };
}

verifies("remote.phone-inbox-parts", () => {
  it("puts Inbox, with its count, Messenger and Agents in the kit's tab bar, a nav named after the computer", async () => {
    const onSelect = vi.fn();
    const screen = render(
      <ComputerTabs
        computer="Tim's laptop"
        inbox={[card("i-1"), card("i-2")]}
        selected="inbox"
        controls="views"
        onSelect={onSelect}
      />,
    );
    const nav = screen.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("Tim's laptop");
    expect(nav?.className).toContain("pb-safe-inset");
    const [inbox, messenger, agents] = [...(nav?.querySelectorAll("button") ?? [])];
    expect(inbox?.getAttribute("aria-current")).toBe("page");
    expect(inbox?.getAttribute("aria-controls")).toBe("views");
    expect(inbox?.querySelector('span[aria-hidden="true"]')?.textContent).toContain("2");
    expect(inbox?.getAttribute("aria-label")).toBe("Inbox, 2 waiting");
    expect(messenger?.textContent).toBe("Messenger");
    expect(agents?.textContent).toBe("Agents");
    await act(async () => agents?.click());
    expect(onSelect).toHaveBeenCalledWith("agents");
  });

  it("shows no count while nothing waits or the Inbox isn't read yet", () => {
    const screen = render(
      <ComputerTabs
        computer="Tim's laptop"
        inbox={undefined}
        selected="agents"
        controls="views"
        onSelect={() => undefined}
      />,
    );
    expect(screen.querySelector("nav button")?.textContent).toBe("Inbox");
  });
});
