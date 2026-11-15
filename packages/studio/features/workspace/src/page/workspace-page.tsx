import { useToastStore } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { useEffect, useRef } from "react";
import { WorkspacePageService } from "../api.ts";
import { WorkspaceTrustSection } from "../trust/workspace-trust-section.tsx";
import {
  onWorkspaceTarget,
  takeWorkspaceTarget,
  WORKSPACE_SECTION_ATTRIBUTE,
  type WorkspacePageTarget,
} from "./workspace-page-target.ts";
import { WORKSPACE_PAGE_TITLE } from "./workspace-page-text.ts";

const REVEAL_WAIT_MS = 5000;

/**
 * Scrolls to the section and focuses its heading. A section other features add loads late, so
 * until it is drawn the page waits for it, and gives up when the page goes, after a few seconds,
 * or at the person's first key press or click, so focus never jumps later.
 */
function reveal(page: HTMLElement, target: WorkspacePageTarget): () => void {
  const find = () =>
    page.querySelector<HTMLElement>(`[${WORKSPACE_SECTION_ATTRIBUTE}="${target}"] h2`);
  const go = (heading: HTMLElement) => {
    heading.scrollIntoView?.({ block: "start" });
    heading.focus({ preventScroll: true });
  };
  const now = find();
  if (now !== null) {
    go(now);
    return () => undefined;
  }
  const stop = () => {
    watch.disconnect();
    window.clearTimeout(timer);
    document.removeEventListener("keydown", stop, true);
    document.removeEventListener("pointerdown", stop, true);
  };
  const watch = new MutationObserver(() => {
    const heading = find();
    if (heading === null) return;
    stop();
    go(heading);
  });
  const timer = window.setTimeout(stop, REVEAL_WAIT_MS);
  document.addEventListener("keydown", stop, true);
  document.addEventListener("pointerdown", stop, true);
  watch.observe(page, { childList: true, subtree: true });
  return stop;
}

/**
 * The workspace page (`workspace.workspace-page`, flow-workspace 6): the open workspace's settings. For now
 * it holds the **Trust** section, then the sections other features add through `itemPage.addSection`
 * on `workspace`, such as Models. Without a folder to trust, as in the served Studio, there is no Trust section.
 *
 * @example
 * <WorkspacePage item={{ kind: "workspace", hub: "local", id: "settings" }} context={context} />
 */
export function WorkspacePage({ context, Sections }: ItemViewProps) {
  const page = context.services.get(WorkspacePageService);
  const toasts = useToastStore();
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stop: () => void = () => undefined;
    const follow = () => {
      // A page kept in a background tab or hidden beside a chat can't take focus. Leave the
      // target for the page that is shown, or the one about to open.
      if (element.current === null || element.current.closest("[hidden], [inert]") !== null) return;
      const target = takeWorkspaceTarget();
      if (target === undefined) return;
      stop();
      stop = reveal(element.current, target);
    };
    follow();
    const unsubscribe = onWorkspaceTarget(follow);
    return () => {
      unsubscribe();
      stop();
    };
  }, []);
  return (
    <div ref={element} className="flex w-full flex-col gap-6 px-6 py-5">
      <header>
        <h1 className="text-title">{WORKSPACE_PAGE_TITLE}</h1>
      </header>
      {page.trust === undefined || toasts === null ? null : (
        <WorkspaceTrustSection trust={page.trust} name={page.name} toasts={toasts} />
      )}
      <Sections />
    </div>
  );
}
