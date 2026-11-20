// @vitest-environment jsdom

import {
  ClipboardProvider,
  createToastStore,
  type ToastStore,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SectionView } from "../settings/settings-dialog.tsx";
import { focusPageHeading } from "../tabs/history-moves.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { PageErrorBoundary } from "./page-error-boundary.tsx";

let toasts: ToastStore;
let writeClipboard: ReturnType<typeof vi.fn<(text: string) => Promise<boolean>>>;

beforeEach(() => {
  toasts = createToastStore();
  writeClipboard = vi.fn(async () => true);
  // React logs every error a boundary catches; here the failures are the point.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  unmountAll();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** A page that throws while it draws until the test lets it work. */
const page = { broken: true };

function WorkflowPage() {
  if (page.broken) {
    throw new TypeError("steps is undefined");
  }
  return (
    <main>
      <h1>Support reply</h1>
    </main>
  );
}

/**
 * The page next to a sidebar button and another pane's page heading, inside the frame's clipboard
 * and toasts.
 */
function renderPage(): HTMLElement {
  return render(
    <ClipboardProvider writeClipboard={writeClipboard}>
      <ToastStoreProvider store={toasts}>
        <nav>
          <button type="button">Inbox</button>
        </nav>
        <main>
          <h1>Home</h1>
        </main>
        <PageErrorBoundary pageKey="workflow-1" pageName="Support reply">
          <WorkflowPage />
        </PageErrorBoundary>
      </ToastStoreProvider>
    </ClipboardProvider>,
  );
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) => b.textContent === name);
  if (found === undefined) {
    throw new Error(`No button "${name}"`);
  }
  return found;
}

async function press(target: HTMLButtonElement): Promise<void> {
  await act(async () => {
    target.focus();
    target.click();
  });
}

/** A Settings section whose view throws as it loads until `state.drawable`. */
function settingsSection(id: string, title: string, state: { readonly drawable: boolean }) {
  return {
    id,
    title,
    scope: "display" as const,
    order: 10,
    featureId: id,
    view: "Section",
    load: async () => {
      if (!state.drawable) throw new TypeError("theme is undefined");
      return { Section: () => <p>{title} works</p> };
    },
  };
}

/**
 * The Appearance and Models sections in the desktop app, in the dialog or on the phone page, after
 * a list row that has the focus, as in the dialog.
 */
async function renderSections({
  page,
  appearance,
  announce,
}: {
  readonly page: boolean;
  readonly appearance: { readonly drawable: boolean };
  readonly announce?: (words: string) => void;
}): Promise<HTMLElement> {
  const sectionView = (registered: ReturnType<typeof settingsSection>) => (
    <SectionView
      section={registered}
      context={{} as WorkspaceContext}
      closeSettings={() => undefined}
      place="app"
      surface={page ? "phone" : "window"}
      page={page}
      announce={announce}
    />
  );
  if (!page) {
    // The dialog's list row, which has the focus as the section opens.
    const row = document.createElement("button");
    row.textContent = "Appearance row";
    document.body.append(row);
    row.focus();
  }
  let container = document.body;
  await act(async () => {
    container = render(
      <ClipboardProvider writeClipboard={writeClipboard}>
        <ToastStoreProvider store={toasts}>
          {sectionView(settingsSection("appearance", "Appearance", appearance))}
          {sectionView(settingsSection("models", "Models", { drawable: true }))}
        </ToastStoreProvider>
      </ClipboardProvider>,
    );
  });
  return container;
}

verifies("shell.page-stopped", () => {
  beforeEach(() => {
    page.broken = true;
  });

  it("shows the page that stopped working, naming it, with Reload page and Copy details", () => {
    const container = renderPage();
    const title = container.querySelector("h2") as HTMLElement;
    expect(title.textContent).toBe("This page stopped working");
    expect(container.textContent).toContain(
      "Halonic ran into a problem showing Support reply. Nothing in your workspace changed.",
    );
    expect(button(container, "Reload page")).toBeDefined();
    expect(button(container, "Copy details").className).toContain(
      "underline decoration-accent-text/50",
    );
    expect(container.textContent).not.toContain("steps is undefined");
    expect(button(container, "Inbox")).toBeDefined();
  });

  it("moves focus to its title when focus was lost", () => {
    renderPage();
    expect(document.activeElement?.textContent).toBe("This page stopped working");
  });

  it("leaves focus in the sidebar when the page stops while the user is there", () => {
    let breakPage = () => {};
    function AgentsPage() {
      const [broken, setBroken] = useState(false);
      breakPage = () => setBroken(true);
      if (broken) {
        throw new Error("rows is undefined");
      }
      return <p>Sorter</p>;
    }
    const container = render(
      <>
        <button type="button">Inbox</button>
        <PageErrorBoundary pageKey="agents" pageName="Agents">
          <AgentsPage />
        </PageErrorBoundary>
      </>,
    );
    const inbox = button(container, "Inbox");
    act(() => inbox.focus());
    act(() => breakPage());
    expect(container.querySelector("h2")?.textContent).toBe("This page stopped working");
    expect(container.textContent).toContain("Halonic ran into a problem showing Agents.");
    expect(document.activeElement).toBe(inbox);
  });

  it("moves focus to its title when the page stops as the user opens it", async () => {
    const container = render(
      <nav>
        <button type="button">Agents</button>
      </nav>,
    );
    button(container, "Agents").focus();
    await act(async () => {
      render(
        <main>
          <PageErrorBoundary pageKey="workflow-1" pageName="Support reply">
            <WorkflowPage />
          </PageErrorBoundary>
        </main>,
      );
      // The sidebar asks for focus on the page's `h1` as it opens the page.
      focusPageHeading();
    });
    const title = document.querySelector("main h2");
    expect(title?.textContent).toBe("This page stopped working");
    expect(document.activeElement).toBe(title);
  });

  it("draws the page again on Reload page and moves focus to its h1", async () => {
    const container = renderPage();
    page.broken = false;
    await press(button(container, "Reload page"));
    const heading = [...container.querySelectorAll("main h1")].at(-1) as HTMLElement;
    expect(heading.textContent).toBe("Support reply");
    expect(document.activeElement).toBe(heading);
  });

  it("moves focus to the title again when Reload page fails again", async () => {
    const container = renderPage();
    await press(button(container, "Reload page"));
    expect(document.activeElement?.textContent).toBe("This page stopped working");
  });

  it("starts fresh when the tab shows another page", () => {
    let open = (_key: string) => {};
    function Tab() {
      const [key, setKey] = useState("workflow-1");
      open = setKey;
      return (
        <PageErrorBoundary pageKey={key} pageName="Support reply">
          {key === "workflow-1" ? <WorkflowPage /> : <p>Second reply</p>}
        </PageErrorBoundary>
      );
    }
    const container = render(<Tab />);
    expect(container.textContent).toContain("This page stopped working");
    act(() => open("workflow-2"));
    expect(container.textContent).toBe("Second reply");
  });

  it("copies the page and the error, then says so in a toast", async () => {
    const container = renderPage();
    await press(button(container, "Copy details"));
    const copied = writeClipboard.mock.calls[0]?.[0] ?? "";
    expect(copied.split("\n")[0]).toBe("This page stopped working: Support reply");
    expect(copied).toContain("TypeError: steps is undefined");
    expect(toasts.list()).toEqual([
      expect.objectContaining({ tone: "info", title: "Copied. Paste it into a bug report." }),
    ]);
  });

  it("says Couldn't copy. when the clipboard refuses", async () => {
    writeClipboard.mockResolvedValue(false);
    const container = renderPage();
    await press(button(container, "Copy details"));
    expect(toasts.list()).toEqual([
      expect.objectContaining({ tone: "danger", title: "Couldn't copy." }),
    ]);
  });

  it.each([
    { page: false, name: "H3", level: "H4" },
    { page: true, name: "H1", level: "H2" },
  ])(
    "says Couldn't load these settings with Reload page in the desktop app, page $page",
    async ({ page, name, level }) => {
      const appearance = { drawable: false };
      const container = await renderSections({ page, appearance });
      const section = container.querySelector("section") as HTMLElement;
      const headings = [...section.querySelectorAll("h1, h2, h3, h4")];
      expect(headings.map((heading) => [heading.tagName, heading.textContent])).toEqual([
        [name, "Appearance"],
        [level, "Couldn't load these settings"],
      ]);
      expect(section.textContent).toContain(
        "Halonic ran into a problem showing the Appearance settings. Nothing in your workspace changed.",
      );
      expect(section.textContent).not.toContain("theme is undefined");
      expect(button(section, "Copy details")).toBeDefined();
      expect(container.textContent).toContain("Models works");

      appearance.drawable = true;
      await press(button(section, "Reload page"));
      expect(section.textContent).toContain("Appearance works");
    },
  );

  it("reads Couldn't load these settings once in the dialog, with the focus left in the list", async () => {
    const said: string[] = [];
    const container = await renderSections({
      page: false,
      appearance: { drawable: false },
      announce: (words) => said.push(words),
    });
    expect(said).toEqual(["Couldn't load these settings"]);
    expect(document.activeElement?.textContent).toBe("Appearance row");

    // A Reload page that fails again moves the focus to the title, which reads it: nothing more.
    await press(button(container.querySelector("section") as HTMLElement, "Reload page"));
    expect(document.activeElement?.textContent).toBe("Couldn't load these settings");
    expect(said).toEqual(["Couldn't load these settings"]);
  });

  it("reads Couldn't load these settings once on the phone page, with the focus left on its h1", async () => {
    const said: string[] = [];
    const heading = document.createElement("h1");
    heading.tabIndex = -1;
    heading.textContent = "Appearance";
    document.body.append(heading);
    heading.focus();
    await renderSections({
      page: true,
      appearance: { drawable: false },
      announce: (words) => said.push(words),
    });
    expect(said).toEqual(["Couldn't load these settings"]);
    expect(document.activeElement).toBe(heading);
  });

  it.each([
    { page: false, name: "H3" },
    { page: true, name: "H1" },
  ])(
    "moves focus to the section's name once Reload page draws it, page $page",
    async ({ page, name }) => {
      const appearance = { drawable: false };
      const container = await renderSections({ page, appearance });
      const section = container.querySelector("section") as HTMLElement;
      appearance.drawable = true;
      await press(button(section, "Reload page"));
      expect(section.textContent).toContain("Appearance works");
      expect(document.activeElement?.tagName).toBe(name);
      expect(document.activeElement?.textContent).toBe("Appearance");
    },
  );
});
