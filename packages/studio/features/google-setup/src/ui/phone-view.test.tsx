// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { account, fakeAccounts, ledger, record } from "../accounts.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { GoogleSetupView } from "./google-setup-view.tsx";

afterEach(unmountAll);

const item = {
  kind: "setup",
  key: "setup:google:gaccount_1",
  provider: "google",
  account: "gaccount_1",
  title: "Set up Google for x@example.com",
  progress: "Step 3 of 7 · Consent screen",
  changedAt: "2026-11-12T02:10:00.000Z",
} as const;

const twoDone = record(["project", "apis"], { projectId: "halonic-x" });

/** Opens the item and returns its title. `served` is a served window on a desktop browser. */
async function openTitle(layout: "phone" | "served"): Promise<HTMLHeadingElement | null> {
  const fake = fakeAccounts([account(twoDone, { services: [ledger] })]);
  const view = (
    <GoogleSetupView
      item={item}
      answering
      close={vi.fn()}
      accounts={layout === "served" ? { ...fake.source, readOnly: true } : fake.source}
    />
  );
  const tree: ReactNode =
    layout === "phone" ? (
      <PresentationProvider presentation="phone">{view}</PresentationProvider>
    ) : (
      view
    );
  const container = render(tree);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container.querySelector("h2");
}

verifies("google-setup.phone-title", () => {
  it("keeps the title for screen readers under a phone's top bar, with the focus", async () => {
    const title = await openTitle("phone");
    expect(title?.textContent).toBe("Google for x@example.com");
    expect(title?.classList.contains("sr-only")).toBe(true);
    expect(title?.classList.contains("text-title")).toBe(false);
    expect(document.activeElement).toBe(title);
  });

  it("shows the title in a served window on a desktop browser", async () => {
    const title = await openTitle("served");
    expect(title?.textContent).toBe("Google for x@example.com");
    expect(title?.classList.contains("sr-only")).toBe(false);
    expect(title?.classList.contains("text-title")).toBe(true);
    expect(document.activeElement).toBe(title);
  });
});
