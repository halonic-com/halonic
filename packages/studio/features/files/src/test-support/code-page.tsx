import { PresentationProvider } from "@halonicjs/studio-kit";
import type { ItemRef, ItemViewProps, WorkspaceContext } from "@halonicjs/studio-shell";
import { act } from "react";
import { codePageItem } from "../code-page.ts";
import type { FilesHost } from "../files-host.ts";
import { CodePage } from "../ui/code-page.tsx";
import { FilesSidebarView } from "../ui/files-sidebar-view.tsx";
import { filesLookup } from "./lookup.ts";
import { render } from "./render.tsx";
import { contextHost, listing, rowNamed, settled } from "./sidebar.ts";

/** How {@link showCodePage} draws the page. */
export interface CodePageOptions {
  readonly presentation?: "desktop" | "phone";
  /** The host's own parts, over a host listing `src/checkout/*.ts` and `README.md`. */
  readonly host?: Partial<FilesHost>;
  /** Draws the sidebar's Files view before the page, as the window does. */
  readonly withSidebar?: boolean;
  /** Draws the page while it is still loading or failing, without waiting for the listing. */
  readonly unsettled?: boolean;
}

/** What {@link showCodePage} drew, and what the page asked the window for. */
export interface ShownCodePage {
  readonly page: HTMLElement;
  /** The sidebar's Files view, when it was asked for. */
  readonly sidebar: HTMLElement | null;
  readonly opened: ItemRef[];
  readonly openedInNewTab: ItemRef[];
  readonly shownViews: string[];
}

function NoSections() {
  return null;
}

/** Draws Code's page with an invented workspace, as the window would, and waits for its listing. */
export async function showCodePage(options: CodePageOptions = {}): Promise<ShownCodePage> {
  const opened: ItemRef[] = [];
  const openedInNewTab: ItemRef[] = [];
  const shownViews: string[] = [];
  const host: FilesHost = {
    ...contextHost(),
    list: async () => listing(["src/checkout/orders.ts", "src/checkout/refunds.ts", "README.md"]),
    read: async (path) => `// ${path}\n`,
    ...options.host,
  };
  const context = {
    services: filesLookup(host),
    announcer: { announce: () => {} },
    openItem: (item: ItemRef) => opened.push(item),
    openItemInNewTab: (item: ItemRef) => openedInNewTab.push(item),
    showSidebarView: (viewId: string) => shownViews.push(viewId),
  } as unknown as WorkspaceContext;
  const props: ItemViewProps = { item: codePageItem, context, Sections: NoSections };
  const sidebar =
    options.withSidebar === true ? render(<FilesSidebarView context={context} />) : null;
  const page = render(
    <PresentationProvider presentation={options.presentation ?? "desktop"}>
      <CodePage {...props} />
    </PresentationProvider>,
  );
  if (options.unsettled !== true) await settled();
  return { page, sidebar, opened, openedInNewTab, shownViews };
}

/** One of the page's two panes. */
export function codePane(page: HTMLElement, name: "list" | "content"): HTMLElement | null {
  return page.querySelector<HTMLElement>(`[data-pane="${name}"]`);
}

/** Clicks the folders open, in order. */
export async function openFolders(page: HTMLElement, ...paths: string[]): Promise<void> {
  for (const path of paths) act(() => rowNamed(page, path).click());
  await settled();
}
