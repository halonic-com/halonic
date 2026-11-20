// @vitest-environment jsdom

import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StudioHost } from "../engine/engine-words.ts";
import { StudioHostContext } from "../engine/studio-host-context.ts";
import { SectionView } from "../settings/settings-dialog.tsx";
import { focusPageHeading } from "../tabs/history-moves.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { ViewRef } from "../view.ts";
import { LoadedView } from "../view-loading.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { PageErrorBoundary } from "./page-error-boundary.tsx";
import { asUnreachable, PartErrorBoundary } from "./page-unreachable.tsx";

beforeEach(() => {
  // React logs every error a boundary catches; here the failures are the point.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

const offline = () =>
  new TypeError("Failed to fetch dynamically imported module: /assets/inbox-page.js");

function InboxPage() {
  return (
    <main>
      <h1>Inbox</h1>
    </main>
  );
}

/** The Inbox's code, whose imports fail with `failure` until the test lets them work. */
function inboxView(failure: () => unknown = offline): {
  readonly view: ViewRef;
  readonly imports: () => number;
  readonly reachable: () => void;
} {
  let imports = 0;
  let reachable = false;
  return {
    view: {
      view: "InboxPage",
      load: async () => {
        imports += 1;
        if (!reachable) throw failure();
        return { InboxPage };
      },
    },
    imports: () => imports,
    reachable: () => {
      reachable = true;
    },
  };
}

async function renderInbox(host: StudioHost, view: ViewRef): Promise<HTMLElement> {
  let container = document.body;
  await act(async () => {
    container = render(
      <StudioHostContext value={host}>
        <PageErrorBoundary pageKey="inbox" pageName="Inbox">
          <LoadedView view={view} name="Inbox" props={{}} />
        </PageErrorBoundary>
      </StudioHostContext>,
    );
  });
  return container;
}

function button(container: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((b) => b.textContent === name);
}

async function press(target: HTMLButtonElement | undefined): Promise<void> {
  await act(async () => {
    target?.focus();
    target?.click();
  });
}

verifies("shell.page-unreachable", () => {
  it.each<StudioHost>(["served", "phone"])(
    "says the computer can't be reached on %s when the page's code fails to load",
    async (host) => {
      const container = await renderInbox(host, inboxView().view);
      expect(container.querySelector("h2")?.textContent).toBe("Couldn't load this page");
      expect(container.textContent).toContain(
        "Halonic couldn't reach the computer to show the Inbox.",
      );
      expect(button(container, "Try again")).toBeDefined();
      expect(button(container, "Copy details")).toBeUndefined();
      expect(button(container, "Reload page")).toBeUndefined();
      expect(document.activeElement?.textContent).toBe("Couldn't load this page");
    },
  );

  it("moves focus to its title when the page fails as the user opens it", async () => {
    const container = render(
      <nav>
        <button type="button">Inbox</button>
      </nav>,
    );
    const inbox = button(container, "Inbox");
    inbox?.focus();
    await act(async () => {
      render(
        <StudioHostContext value="served">
          <main>
            <PageErrorBoundary pageKey="inbox" pageName="Inbox">
              <LoadedView view={inboxView().view} name="Inbox" props={{}} />
            </PageErrorBoundary>
          </main>
        </StudioHostContext>,
      );
      // The sidebar asks for focus on the page's `h1` as it opens the page.
      focusPageHeading();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const title = document.querySelector("main h2");
    expect(title?.textContent).toBe("Couldn't load this page");
    expect(document.activeElement).toBe(title);
  });

  it("imports the page's code again in place on Try again and moves focus to its h1", async () => {
    const inbox = inboxView();
    const container = await renderInbox("served", inbox.view);
    inbox.reachable();
    await press(button(container, "Try again"));
    expect(inbox.imports()).toBe(2);
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("Inbox");
    expect(document.activeElement).toBe(heading);
  });

  it("stays and moves focus to its title when Try again fails again", async () => {
    const inbox = inboxView();
    const container = await renderInbox("phone", inbox.view);
    await press(button(container, "Try again"));
    expect(inbox.imports()).toBe(2);
    expect(container.querySelector("h2")?.textContent).toBe("Couldn't load this page");
    expect(document.activeElement?.textContent).toBe("Couldn't load this page");
  });

  it("keeps This page stopped working in the desktop app, whose code is on the computer", async () => {
    const container = await renderInbox("desktop-app", inboxView().view);
    expect(container.querySelector("h2")?.textContent).toBe("This page stopped working");
    expect(button(container, "Copy details")).toBeDefined();
  });

  it("keeps This page stopped working on the served Studio for an error that isn't a failed load", async () => {
    const broken = inboxView(() => new TypeError("rows is undefined"));
    const container = await renderInbox("served", broken.view);
    expect(container.querySelector("h2")?.textContent).toBe("This page stopped working");
  });

  it("shows a Settings section's own can't-reach state, and nothing for another failure", async () => {
    let container = document.body;
    await act(async () => {
      container = render(
        <StudioHostContext value="served">
          <PartErrorBoundary name="Appearance settings">
            <LoadedView view={inboxView().view} props={{}} />
          </PartErrorBoundary>
          <PartErrorBoundary name="Models settings">
            <LoadedView view={inboxView(() => new Error("broken")).view} props={{}} />
          </PartErrorBoundary>
        </StudioHostContext>,
      );
    });
    expect(container.textContent).toBe(
      "Couldn't load this pageHalonic couldn't reach the computer to show the Appearance settings.Try again",
    );
  });

  it.each([
    { page: false, level: "H4" },
    { page: true, level: "H2" },
  ])(
    "says Couldn't load these settings in a Settings section, page $page",
    async ({ page, level }) => {
      const appearance = { id: "appearance", title: "Appearance", scope: "display" as const };
      let container = document.body;
      await act(async () => {
        container = render(
          <StudioHostContext value="served">
            <SectionView
              section={{ ...appearance, order: 10, featureId: "appearance", ...inboxView().view }}
              context={{} as WorkspaceContext}
              closeSettings={() => undefined}
              place="served"
              surface={page ? "phone" : "window"}
              page={page}
            />
          </StudioHostContext>,
        );
      });
      const title = [...container.querySelectorAll("h2, h4")].find(
        (heading) => heading.textContent === "Couldn't load these settings",
      );
      expect(title?.tagName).toBe(level);
      expect(container.textContent).toContain(
        "Halonic couldn't reach the computer to show the Appearance settings.",
      );
    },
  );

  it("words a Home card's failed load as the computer that can't be reached", () => {
    const error = asUnreachable("phone", offline(), "show Recent runs");
    expect(errorKindOf(error)).toBe("unavailable");
    expect((error as Error).message).toBe(
      "Halonic couldn't reach the computer to show Recent runs.",
    );
    const bug = new TypeError("rows is undefined");
    expect(asUnreachable("phone", bug, "show Recent runs")).toBe(bug);
    const local = offline();
    expect(asUnreachable("desktop-app", local, "show Recent runs")).toBe(local);
  });
});
