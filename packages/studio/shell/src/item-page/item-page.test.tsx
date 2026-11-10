// @vitest-environment jsdom

import type { Tab } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountedTabLimit } from "../tabs/mounted-tabs.ts";
import { TabPages } from "../tabs/tab-pages.tsx";
import { type TabLocation, TabSet } from "../tabs/tab-set.ts";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ItemPage, type ItemPageProps } from "./item-page.tsx";

type View = "flow" | "configuration" | "runs";

const views: ItemPageProps<View>["views"] = [
  { id: "flow", label: "Flow" },
  {
    id: "configuration",
    label: "Configuration",
    count: { value: 2, tone: "danger", name: "2 errors" },
  },
  { id: "runs", label: "Runs", count: { value: 1, tone: "warning", name: "1 needs you" } },
];

let uninstallPopover: () => void;

beforeEach(() => {
  uninstallPopover = installFakePopover();
});

afterEach(() => {
  unmountAll();
  uninstallPopover();
  vi.restoreAllMocks();
});

function Workflow(props: Partial<ItemPageProps<View>> & { readonly name?: string }) {
  return (
    <ItemPage<View>
      icon={<svg />}
      kind="Workflow"
      name="Support reply"
      onRename={() => {}}
      views={views}
      end={<button type="button">Run</button>}
      {...props}
    >
      {(view) => <p>{view} view</p>}
    </ItemPage>
  );
}

function nameField(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[aria-label="Workflow name"]') as HTMLInputElement;
}

function typeInto(field: HTMLInputElement, text: string): void {
  act(() => {
    field.focus();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(element: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}

function viewTab(container: HTMLElement, label: string): HTMLElement {
  const tabs = [...container.querySelectorAll<HTMLElement>('header [role="tab"]')];
  return tabs.find((tab) => tab.textContent?.startsWith(label)) as HTMLElement;
}

verifies("shell.item-page-header", () => {
  it("heads the page with the icon, the kind in small caps, the name, ⋮ and the views", () => {
    const container = render(
      <Workflow actions={[{ id: "delete", label: "Delete…", danger: true, onSelect: () => {} }]} />,
    );
    const header = container.querySelector("header") as HTMLElement;
    const heading = header.querySelector("h1") as HTMLElement;
    const kind = heading.querySelector(".uppercase") as HTMLElement;
    expect(kind.textContent).toBe("Workflow");
    expect(kind.className).toContain("text-caption uppercase tracking-label text-fg-subtle");
    expect(nameField(container).value).toBe("Support reply");
    expect(heading.contains(nameField(container))).toBe(true);
    expect(
      header.querySelector('button[aria-label="More actions for Support reply"]'),
    ).not.toBeNull();
    expect(header.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(
      "Workflow views",
    );
    expect(header.className).toContain("min-h-13");
    expect(header.className).toContain("grid-cols-[1fr_auto_1fr]");
    expect(header.lastElementChild?.textContent).toBe("Run");
  });

  it("has no ⋮ when the kind has no actions", () => {
    const container = render(<Workflow />);
    expect(container.querySelector('button[aria-label^="More actions"]')).toBeNull();
  });

  it("reads the views' badges after their names", () => {
    const container = render(<Workflow />);
    expect(viewTab(container, "Configuration").textContent).toContain(", 2 errors");
    expect(viewTab(container, "Runs").textContent).toContain(", 1 needs you");
  });

  it("keeps a new name on Enter, trimmed", () => {
    const onRename = vi.fn();
    const container = render(<Workflow onRename={onRename} />);
    typeInto(nameField(container), "  Intake v2 ");
    press(nameField(container), "Enter");
    expect(onRename).toHaveBeenCalledWith("Intake v2");
  });

  it("keeps a new name when the field is left", () => {
    const onRename = vi.fn();
    const container = render(<Workflow onRename={onRename} />);
    typeInto(nameField(container), "Intake v2");
    act(() => nameField(container).blur());
    expect(onRename).toHaveBeenCalledWith("Intake v2");
  });

  it("asks for one rename per edit, even when the name hasn't changed yet", () => {
    // The rename is async or rejected, so `name` is still the old one when the field is left.
    const onRename = vi.fn();
    const container = render(<Workflow onRename={onRename} />);
    typeInto(nameField(container), "Intake v2");
    press(nameField(container), "Enter");
    act(() => nameField(container).blur());
    expect(onRename).toHaveBeenCalledTimes(1);

    // A new edit may ask for the same name again.
    typeInto(nameField(container), "Intake v");
    typeInto(nameField(container), "Intake v2");
    press(nameField(container), "Enter");
    expect(onRename).toHaveBeenCalledTimes(2);
    expect(onRename).toHaveBeenLastCalledWith("Intake v2");
  });

  it("puts the old name back on Esc, and that Esc does nothing else", () => {
    const onRename = vi.fn();
    const container = render(<Workflow onRename={onRename} />);
    typeInto(nameField(container), "Intake v2");
    const escapePress = press(nameField(container), "Escape");
    expect(nameField(container).value).toBe("Support reply");
    expect(escapePress.defaultPrevented).toBe(true);
    act(() => nameField(container).blur());
    expect(onRename).not.toHaveBeenCalled();
  });

  it("leaves Esc to the layers under the page when the name is unchanged", () => {
    const container = render(<Workflow />);
    expect(press(nameField(container), "Escape").defaultPrevented).toBe(false);
  });

  it("puts the old name back instead of keeping an empty one", () => {
    const onRename = vi.fn();
    const container = render(<Workflow onRename={onRename} />);
    typeInto(nameField(container), "   ");
    press(nameField(container), "Enter");
    expect(onRename).not.toHaveBeenCalled();
    expect(nameField(container).value).toBe("Support reply");
  });

  it("shows one view at a time, picked in the header", () => {
    const container = render(<Workflow />);
    const panel = container.querySelector('[role="tabpanel"]') as HTMLElement;
    expect(panel.textContent).toBe("flow view");
    act(() => viewTab(container, "Runs").click());
    expect(panel.textContent).toBe("runs view");
    expect(panel.getAttribute("aria-labelledby")).toBe(viewTab(container, "Runs").id);
  });

  it("shows the view its tab was left on, even after the page was unmounted", () => {
    const reply: TabLocation = {
      key: "workflow/acme/reply",
      title: "Support reply",
      kind: "workflow",
    };
    const tabs = new TabSet();
    tabs.openHere(reply);
    const container = render(
      <main>
        <TabPages
          tabs={tabs}
          renderPage={(location) =>
            location.key === reply.key ? <Workflow /> : <h1>{location.title}</h1>
          }
        />
      </main>,
    );
    const replyTab = tabs.state.activeId;
    act(() => viewTab(container, "Runs").click());

    // Enough other tabs that Support reply's page isn't kept mounted any more.
    for (let index = 0; index < mountedTabLimit; index += 1) {
      act(() => {
        const opened = tabs.openInNewTab({
          key: `agent/acme/a${index}`,
          title: `A${index}`,
          kind: "agent",
        });
        tabs.activate(opened.tab.id);
      });
    }
    expect(container.querySelector(`[data-tab-page="${replyTab}"]`)).toBeNull();

    act(() => tabs.activate(replyTab));
    const panel = container.querySelector(`[data-tab-page="${replyTab}"] [role="tabpanel"]`);
    expect(panel?.textContent).toBe("runs view");
  });

  it("shows the first view when the view it was on is gone", () => {
    const fewer: readonly [Tab<View>, ...Tab<View>[]] = [{ id: "flow", label: "Flow" }];
    let dropViews = () => {};
    function Changing() {
      const [shown, setShown] = useState(views);
      dropViews = () => setShown(fewer);
      return <Workflow views={shown} />;
    }
    const container = render(<Changing />);
    act(() => viewTab(container, "Runs").click());

    act(() => dropViews());
    const panel = container.querySelector('[role="tabpanel"]') as HTMLElement;
    expect(panel.textContent).toBe("flow view");
    expect(viewTab(container, "Flow").getAttribute("aria-selected")).toBe("true");
  });
});
