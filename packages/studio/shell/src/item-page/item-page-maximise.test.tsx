// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type CloseStack, createCloseStack } from "../close-stack/close-stack.ts";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { FakeResizeObserver } from "../test-support/fake-resize-observer.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ItemPage } from "./item-page.tsx";

let uninstallPopover: () => void;
let uninstallResizeObserver: () => void;

beforeEach(() => {
  uninstallPopover = installFakePopover();
  uninstallResizeObserver = FakeResizeObserver.install(1600);
});

afterEach(() => {
  unmountAll();
  uninstallPopover();
  uninstallResizeObserver();
});

/** A view with a field, to show that maximise and restore keep what was typed in it. */
function Flow() {
  return <input aria-label="Note" defaultValue="" />;
}

/** Agent "Refund checker" with its chat open beside the Flow panel. */
function renderAgent(closeStack: CloseStack = createCloseStack()) {
  const container = render(
    <ItemPage
      icon={<svg />}
      kind="Agent"
      name="Refund checker"
      onRename={() => {}}
      views={[{ id: "flow", label: "Flow" }]}
      chat={{ startsOpen: true, render: () => <p>Chat</p> }}
      closeStack={closeStack}
    >
      {() => <Flow />}
    </ItemPage>,
  );
  const button = (name: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  const buttonReading = (text: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent === text,
    ) ?? null;
  const chat = () => container.querySelector("[data-item-chat]") as HTMLElement;
  const margin = () => container.querySelector<HTMLElement>("[data-maximise-margin]");
  const panel = () =>
    (container.querySelector('[role="tabpanel"]') as HTMLElement).parentElement as HTMLElement;
  return { container, closeStack, button, buttonReading, chat, margin, panel };
}

function click(element: HTMLElement | null) {
  act(() => element?.click());
}

function pressEscape(closeStack: CloseStack) {
  act(() => {
    closeStack.escape();
  });
}

verifies("shell.panel-maximise", () => {
  it("covers the tab inside the margin, dims the chat and keeps focus on the restore mark", () => {
    const { button, chat, margin, panel } = renderAgent();
    const maximise = button("Maximise Flow");
    const close = button("Close Flow") as HTMLButtonElement;
    expect(maximise?.compareDocumentPosition(close)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    act(() => maximise?.focus());
    click(maximise);

    const restore = button("Restore Flow");
    expect(restore).toBe(maximise);
    expect(document.activeElement).toBe(restore);
    expect(panel().className).toContain("inset-28");
    expect(panel().style.width).toBe("");
    expect(chat().hasAttribute("inert")).toBe(true);
    expect(margin()).not.toBeNull();
  });

  it("names its tooltip after itself", () => {
    const { button } = renderAgent();

    const maximise = button("Maximise Flow") as HTMLButtonElement;
    expect(maximise.hasAttribute("aria-describedby")).toBe(false);
    const tooltip = document.querySelector('[role="tooltip"]');
    expect(tooltip?.textContent).toBe("Maximise Flow");
  });

  it("restores with the restore mark, back at the panel's width", () => {
    const { button, chat, margin, panel } = renderAgent();

    click(button("Maximise Flow"));
    click(button("Restore Flow"));

    expect(panel().style.width).toBe("700px");
    expect(chat().hasAttribute("inert")).toBe(false);
    expect(margin()).toBeNull();
  });

  it("restores on a click in the margin and puts focus on the ⤢", () => {
    const { button, margin, panel } = renderAgent();

    click(button("Maximise Flow"));
    click(margin());

    expect(panel().style.width).toBe("700px");
    expect(document.activeElement).toBe(button("Maximise Flow"));
  });

  it("restores on Esc, after the cards above it have closed", () => {
    const { button, closeStack, panel } = renderAgent();
    click(button("Maximise Flow"));
    const closed: string[] = [];
    act(() => {
      closeStack.open({ kind: "stacked-card", close: () => Boolean(closed.push("card")) });
    });

    pressEscape(closeStack);
    expect(closed).toEqual(["card"]);
    expect(button("Restore Flow")).not.toBeNull();

    pressEscape(closeStack);
    expect(button("Maximise Flow")).not.toBeNull();
    expect(panel().style.width).toBe("700px");
    expect(closeStack.top()).toBeUndefined();
  });

  it("keeps the view as it was and shows no resize edge while maximised", () => {
    const { container, button } = renderAgent();
    const note = container.querySelector('input[aria-label="Note"]') as HTMLInputElement;
    note.value = "check the EU refunds";

    click(button("Maximise Flow"));
    expect(container.querySelector('[role="separator"]')).toBeNull();
    click(button("Restore Flow"));

    expect(container.querySelector('input[aria-label="Note"]')).toBe(note);
    expect(note.value).toBe("check the EU refunds");
    expect(container.querySelector('[role="separator"]')).not.toBeNull();
  });

  it("comes back beside the chat after ✕ closed it while maximised", () => {
    const { button, buttonReading, panel } = renderAgent();

    click(button("Maximise Flow"));
    click(button("Close Flow"));
    click(buttonReading("Flow"));

    expect(button("Maximise Flow")).not.toBeNull();
    expect(panel().style.width).toBe("700px");
  });

  it("has no ⤢ when the panel shows as a button in a narrow tab", () => {
    const { button } = renderAgent();
    FakeResizeObserver.resize(800);

    expect(button("Maximise Flow")).toBeNull();
  });

  it("is beside the chat again when a tab that went too narrow for it widens", () => {
    const { button, chat } = renderAgent();
    click(button("Maximise Flow"));

    act(() => FakeResizeObserver.resize(800));
    act(() => FakeResizeObserver.resize(1600));

    expect(button("Maximise Flow")).not.toBeNull();
    expect(button("Restore Flow")).toBeNull();
    expect(chat().hasAttribute("inert")).toBe(false);
  });
});
