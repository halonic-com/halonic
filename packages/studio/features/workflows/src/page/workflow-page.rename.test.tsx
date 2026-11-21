// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkflowsHost } from "../api.ts";
import { listing, memoryHost, memoryRuns, show, typeInto, unmount } from "../test-support.tsx";
import { reply } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(unmount);

/** Acme has Support reply and Mail triage; beta has a workflow called Billing. */
const everyWorkflow = [
  listing("acme", "reply", "Support reply"),
  listing("acme", "triage", "Mail triage"),
  listing("beta", "billing", "Billing"),
];

async function showPage(overrides: Partial<WorkflowsHost> = {}) {
  const { host } = memoryHost([], everyWorkflow, [reply], [], overrides);
  const announce = vi.fn();
  const toasts = createToastStore();
  const page = await show(
    <ToastStoreProvider store={toasts}>
      <WorkflowScreen
        host={host}
        runs={memoryRuns().source}
        hubId="acme"
        id="reply"
        announce={announce}
      />
    </ToastStoreProvider>,
  );
  const field = () =>
    page.querySelector<HTMLInputElement>('h1 input[aria-label="Workflow name"]') ?? undefined;
  // Focused, as a person's typing is, so leaving the field blurs it.
  act(() => field()?.focus());
  return { page, field, announce, toasts };
}

async function press(input: HTMLInputElement, key: string) {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

verifies("workflows.page.rename", () => {
  it("renames from the header's name field on Enter, and says so", async () => {
    const rename = vi.fn(async () => {});
    const { field, announce } = await showPage({ rename });
    const input = field() as HTMLInputElement;
    expect(input.value).toBe("Support reply");

    await typeInto(input, "Support answers");
    await press(input, "Enter");

    expect(rename).toHaveBeenCalledWith({ hubId: "acme", id: "reply" }, "Support answers");
    expect(announce).toHaveBeenCalledWith("Renamed to Support answers.");
  });

  it("says a name another workflow of the hub has is taken, and doesn't rename", async () => {
    const rename = vi.fn(async () => {});
    const { page, field } = await showPage({ rename });
    const input = field() as HTMLInputElement;

    await typeInto(input, "mail triage");
    // Enter shows the reason at once, without waiting for the typing to pause.
    await press(input, "Enter");
    expect(page.textContent).toContain("A workflow called mail triage already exists.");
    await act(async () => input.blur());

    expect(rename).not.toHaveBeenCalled();
    expect(input.value).toBe("Support reply");
  });

  it("allows a name only another hub has", async () => {
    const rename = vi.fn(async () => {});
    const { page, field } = await showPage({ rename });
    const input = field() as HTMLInputElement;

    await typeInto(input, "Billing");
    expect(page.textContent).not.toContain("already exists");
    await press(input, "Enter");

    expect(rename).toHaveBeenCalledWith({ hubId: "acme", id: "reply" }, "Billing");
  });

  it("puts the old name back on Esc", async () => {
    const rename = vi.fn(async () => {});
    const { field } = await showPage({ rename });
    const input = field() as HTMLInputElement;

    await typeInto(input, "Support answers");
    await press(input, "Escape");
    await act(async () => input.blur());

    expect(input.value).toBe("Support reply");
    expect(rename).not.toHaveBeenCalled();
  });

  it("shows why on a toast when the host refuses, and says nothing was renamed", async () => {
    const rename = vi.fn(async () => {
      throw new KindedError("conflict", "A workflow called Support answers already exists.");
    });
    const { field, announce, toasts } = await showPage({ rename });
    const input = field() as HTMLInputElement;

    await typeInto(input, "Support answers");
    await press(input, "Enter");

    expect(announce).not.toHaveBeenCalled();
    expect(toasts.list()[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't rename Support reply",
      text: "A workflow called Support answers already exists.",
    });
  });

  it("shows the name as a title while the host can't rename, and on a phone", async () => {
    const { field } = await showPage();
    expect(field()).toBeUndefined();

    unmount();
    const { host } = memoryHost([], everyWorkflow, [reply], [], { rename: async () => {} });
    const phone = await show(
      <PresentationProvider presentation="phone">
        <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />
      </PresentationProvider>,
    );
    expect(phone.querySelector("h1 input")).toBeNull();
    expect(phone.querySelector("h1")?.textContent).toBe("Support reply");
  });
});
