// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Announcer } from "../announcer/announcer.ts";
import type { SettingsScope, SettingsSectionContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import {
  SettingsDialog,
  type SettingsDialogProps,
  type SettingsSectionProps,
} from "./settings-dialog.tsx";

let restoreMedia: () => void;
let restoreModal: () => void;

beforeEach(() => {
  restoreMedia = new FakeMediaQueries(1280).install();
  restoreModal = fakeShowModal();
  // React logs every error a boundary catches; in the failure test that is the point.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia();
  vi.restoreAllMocks();
});

/** A section whose view says which section it is and whose context it got. */
function section(
  id: string,
  title: string,
  scope: SettingsScope,
  order: number,
): Registered<SettingsSectionContribution> {
  const View = ({ context }: SettingsSectionProps) => (
    <p>{`${title} view for ${context.services.toString()}`}</p>
  );
  return { id, title, scope, order, view: "View", load: async () => ({ View }), featureId: id };
}

const appearance = section("appearance", "Appearance", "display", 10);
const formats = section("formats", "Formats", "display", 20);
const assistant = section("assistant", "Assistant", "host", 30);
const models = section("models", "Models", "workspace", 10);

function contextOf(featureId: string): WorkspaceContext {
  return {
    services: { toString: () => featureId } as unknown as WorkspaceContext["services"],
    announcer: { announce: () => undefined } as unknown as Announcer,
  };
}

/** Opens Settings and lets the current section's view import. */
async function open(props: Partial<SettingsDialogProps> = {}) {
  const said: string[] = [];
  const announcer = { announce: (text: string) => said.push(text) } as unknown as Announcer;
  const container = render(
    <SettingsDialog
      sections={[appearance, formats, assistant, models]}
      workspaceName="Acme"
      place="app"
      contextFor={contextOf}
      announcer={announcer}
      onClose={() => undefined}
      {...props}
    />,
  );
  await settle();
  return { container, said };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

function row(container: HTMLElement, name: string): HTMLElement {
  const found = [...container.querySelectorAll<HTMLElement>("nav button")].find(
    (button) => button.textContent === name,
  );
  if (found === undefined) {
    throw new Error(`No row named ${name}`);
  }
  return found;
}

function press(key: string) {
  act(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

verifies("shell.settings-container", () => {
  it("shows a dialog named Settings with no footer, the grouped list and the section", async () => {
    const { container } = await open();
    const dialog = container.querySelector("dialog");
    const titleId = dialog?.getAttribute("aria-labelledby") ?? "";
    expect(document.getElementById(titleId)?.textContent).toBe("Settings");
    expect(dialog?.querySelector("footer")).toBeNull();
    const nav = container.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("Settings sections");
    const headings = [...(nav?.querySelectorAll("h3") ?? [])].map((heading) => heading.textContent);
    expect(headings).toEqual(["Acme, Workspace settings", "On this computer"]);
    const rows = [...(nav?.querySelectorAll("button") ?? [])].map((button) => button.textContent);
    expect(rows).toEqual(["Models", "Appearance", "Formats", "Assistant"]);
    expect(row(container, "Appearance").getAttribute("aria-current")).toBe("page");
    expect(container.querySelector("section h3")?.textContent).toBe("Appearance");
    expect(container.textContent).toContain("Appearance view for appearance");
  });

  it("lists no workspace group when no workspace is open", async () => {
    const { container } = await open({ workspaceName: undefined });
    const rows = [...container.querySelectorAll("nav button")].map((button) => button.textContent);
    expect(rows).toEqual(["Appearance", "Formats", "Assistant"]);
  });

  it("keeps the list and the section's name when its view fails to load", async () => {
    const broken = { ...assistant, load: async () => ({}) };
    const { container } = await open({ sections: [appearance, broken], requested: "assistant" });
    await settle();
    expect(container.querySelector("section h3")?.textContent).toBe("Assistant");
    act(() => row(container, "Appearance").click());
    await settle();
    expect(container.textContent).toContain("Appearance view for appearance");
  });
});

verifies("shell.settings-keyboard", () => {
  it("focuses the current section's row when it opens", async () => {
    const { container } = await open({ requested: "formats" });
    expect(document.activeElement).toBe(row(container, "Formats"));
  });

  it("moves the focus with the arrows without switching, and switches on Enter", async () => {
    const shown: string[] = [];
    const { container, said } = await open({ onShown: (id) => shown.push(id) });
    press("ArrowDown");
    expect(document.activeElement).toBe(row(container, "Formats"));
    expect(container.querySelector("section h3")?.textContent).toBe("Appearance");
    expect(row(container, "Formats").tabIndex).toBe(0);
    expect(row(container, "Appearance").tabIndex).toBe(-1);

    // A button's Enter is its click.
    act(() => row(container, "Formats").click());
    await settle();
    expect(container.querySelector("section h3")?.textContent).toBe("Formats");
    expect(document.activeElement).toBe(row(container, "Formats"));
    expect(said).toEqual(["Formats"]);
    expect(shown).toEqual(["appearance", "formats"]);
  });

  it("gives the Tab stop back to the current row when the focus leaves the list", async () => {
    const { container } = await open();
    press("End");
    expect(document.activeElement).toBe(row(container, "Assistant"));
    act(() => container.querySelector<HTMLElement>("dialog button[aria-label]")?.focus());
    expect(row(container, "Appearance").tabIndex).toBe(0);
    expect(row(container, "Assistant").tabIndex).toBe(-1);
  });
});
