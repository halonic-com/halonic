import { useToastStore } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { useEffect, useRef } from "react";
import { WorkspacePageService } from "../api.ts";
import { WorkspaceTrustSection } from "../trust/workspace-trust-section.tsx";
import {
  hasWorkspaceTarget,
  onWorkspaceTarget,
  takeWorkspaceTarget,
  WORKSPACE_SECTION_ATTRIBUTE,
  type WorkspacePageTarget,
} from "./workspace-page-target.ts";
import { WORKSPACE_PAGE_TITLE } from "./workspace-page-text.ts";

const REVEAL_WAIT_MS = 5000;
/** How long a section opened for a change keeps its highlight. */
const HIGHLIGHT_MS = 1000;
/** The sections a command opens to change something, highlighted once so the eye finds them. */
const HIGHLIGHTED: ReadonlySet<WorkspacePageTarget> = new Set(["budget"]);
/** The highlight's fill: a colour that changes at once, with no movement for reduced motion to stop. */
const HIGHLIGHT_CLASS = "bg-accent-soft";

/**
 * Scrolls to the section and focuses its first heading, an `h2` or an `h3` for a block inside a
 * section. A section other features add loads late, so until it is drawn the page waits for it,
 * and gives up when the page goes, after a few seconds, or at the person's first key press or
 * click, so focus never jumps later. A highlighted section keeps its fill for a second; the stop
 * this returns also takes it off, so a new request or the page going never leaves it on.
 */
function reveal(page: HTMLElement, target: WorkspacePageTarget): () => void {
  const section = `[${WORKSPACE_SECTION_ATTRIBUTE}="${target}"]`;
  const find = () => page.querySelector<HTMLElement>(`${section} :is(h2, h3)`);
  let unmark: () => void = () => undefined;
  const go = (heading: HTMLElement) => {
    heading.scrollIntoView?.({ block: "start" });
    heading.focus({ preventScroll: true });
    const marked = HIGHLIGHTED.has(target) ? heading.closest<HTMLElement>(section) : null;
    if (marked === null) return;
    marked.classList.add(HIGHLIGHT_CLASS);
    const timer = window.setTimeout(() => marked.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
    unmark = () => {
      window.clearTimeout(timer);
      marked.classList.remove(HIGHLIGHT_CLASS);
    };
  };
  const now = find();
  if (now !== null) {
    go(now);
    return () => unmark();
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
  return () => {
    stop();
    unmark();
  };
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
    let unwatch: () => void = () => undefined;
    let wait: number | undefined;
    // A page in a background tab or hidden beside a chat can't take focus. It leaves the target
    // and watches for the `hidden` or `inert` that hides it to go, so a tab the command is about
    // to show takes the target once it is shown.
    const watchUntilShown = () => {
      unwatch();
      const end = () => {
        watcher.disconnect();
        window.clearTimeout(timer);
        unwatch = () => undefined;
      };
      const watcher = new MutationObserver(() => {
        if (!hasWorkspaceTarget()) return end();
        follow();
      });
      const timer = window.setTimeout(end, REVEAL_WAIT_MS);
      watcher.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["hidden", "inert"],
        subtree: true,
      });
      unwatch = end;
    };
    const follow = () => {
      if (element.current === null || !hasWorkspaceTarget()) return;
      if (element.current.closest("[hidden], [inert]") !== null) {
        watchUntilShown();
        return;
      }
      const target = takeWorkspaceTarget();
      if (target === undefined) return;
      unwatch();
      stop();
      stop = reveal(element.current, target);
    };
    follow();
    // The command that asks may also switch to this page. Look after that change is drawn, and
    // after the page's heading took focus, so the section keeps it.
    const unsubscribe = onWorkspaceTarget(() => {
      window.clearTimeout(wait);
      wait = window.setTimeout(follow, 0);
    });
    return () => {
      window.clearTimeout(wait);
      unsubscribe();
      unwatch();
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
