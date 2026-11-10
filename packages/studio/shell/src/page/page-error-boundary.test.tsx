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
import { render, unmountAll } from "../test-support/render.tsx";
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
    expect(button(container, "Copy details").className).toContain("hover:underline");
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
});
