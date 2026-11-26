// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { type PhoneTab, PhoneTabBar } from "./phone-tab-bar.tsx";

afterEach(() => {
  unmountAll();
});

type View = "inbox" | "agents";

function tabs(inboxCount: number): PhoneTab<View>[] {
  return [
    {
      id: "inbox",
      label: "Inbox",
      icon: (picked) => <svg data-picked={picked} />,
      count: { value: inboxCount, name: `${inboxCount} waiting` },
    },
    { id: "agents", label: "Agents", icon: (picked) => <svg data-picked={picked} /> },
  ];
}

function renderBar(inboxCount: number) {
  const onSelect = vi.fn();
  const { container } = render(
    <PhoneTabBar
      label="Tim's laptop"
      tabs={tabs(inboxCount)}
      selected="inbox"
      onSelect={onSelect}
    />,
  );
  const nav = container.querySelector("nav");
  if (nav === null) throw new Error("No nav.");
  const [inbox, agents] = [...nav.querySelectorAll("button")];
  if (inbox === undefined || agents === undefined) throw new Error("No tabs.");
  return { nav, inbox, agents, onSelect };
}

verifies("kit.phone-tab-bar", () => {
  it("is a nav at the bottom, the picked tab current with its filled icon and its count", () => {
    const { nav, inbox, agents } = renderBar(3);
    expect(nav.getAttribute("aria-label")).toBe("Tim's laptop");
    expect(nav.className).toContain("border-t border-border");
    expect(nav.className).toContain("pb-safe-inset");
    expect(inbox.getAttribute("aria-current")).toBe("page");
    expect(agents.hasAttribute("aria-current")).toBe(false);
    expect(inbox.querySelector("svg")?.getAttribute("data-picked")).toBe("true");
    expect(agents.querySelector("svg")?.getAttribute("data-picked")).toBe("false");
    expect(inbox.querySelector(".bg-halo-tint")).not.toBeNull();
    // The chip is hidden; the name says the count once, after the label.
    expect(inbox.querySelector('span[aria-hidden="true"]')?.textContent).toContain("3");
    expect(inbox.querySelector(":scope > .sr-only")?.textContent).toBe(", 3 waiting");
  });

  it("calls onSelect with the tapped tab's id", async () => {
    const { agents, onSelect } = renderBar(3);
    await act(async () => agents.click());
    expect(onSelect).toHaveBeenCalledWith("agents");
  });

  it("shows no count while it is 0", () => {
    const { inbox } = renderBar(0);
    expect(inbox.textContent).toBe("Inbox");
  });
});
