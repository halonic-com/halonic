// What a click on a run notification opens in Studio's page (requirement
// `runs.run-notification-open`). It only shows: it never stops, starts or
// changes a run.

import type { NoticeTarget, RunNoticeClicks } from "@halonicjs/studio-services";
import {
  type ItemRef,
  type ServiceKey,
  type SidebarPlace,
  serviceKey,
} from "@halonicjs/studio-shell";
import type { RunsList } from "../runs-list.ts";

/**
 * The clicks on run notifications that reach this page; the app provides it in the desktop shell
 * (`shellRunNoticeClicks`). Without it, as in a browser, a click opens nothing here.
 */
export const RunNoticeClicksService: ServiceKey<RunNoticeClicks> =
  serviceKey<RunNoticeClicks>("runs.notice-clicks");

/** How the page opens what a click names. */
export interface RunNoticeOpeners {
  /** The open workspace's runs, to find the clicked run's hub. */
  readonly list: RunsList;
  readonly openItem: (item: ItemRef) => void;
  readonly openPlace: (place: SidebarPlace) => void;
}

/**
 * Opens what a run notification's click names: the run's page when the workspace lists it, Runs
 * when it doesn't (the run may belong to another source), and Runs on the Failed group for
 * `runs-failed`. Any other kind opens nothing. A run waits for the list's first load, or its
 * failure, before it's looked up, so a click that opened the window finds it. Returns a function
 * that cancels a wait that hasn't ended.
 *
 * @example
 * const cancel = openRunNotice({ kind: "run", id: "run-acme-7" }, { list, openItem, openPlace });
 */
export function openRunNotice(target: NoticeTarget, openers: RunNoticeOpeners): () => void {
  const { list, openPlace } = openers;
  if (target.kind === "runs-failed") {
    list.showFailed();
    openPlace("runs");
    return () => undefined;
  }
  if (target.kind !== "run") return () => undefined;
  return afterFirstLoad(list, () => openRun(target.id, openers));
}

/** Calls `then` once `list` has loaded or failed to load, now when it already has. */
function afterFirstLoad(list: RunsList, then: () => void): () => void {
  const settled = () => list.state.loaded || list.state.error !== undefined;
  if (settled()) {
    then();
    return () => undefined;
  }
  const stop = list.subscribe(() => {
    if (!settled()) return;
    stop();
    then();
  });
  return stop;
}

function openRun(id: string, { list, openItem, openPlace }: RunNoticeOpeners): void {
  const run = list.state.runs.find(({ summary }) => summary.id === id);
  if (run === undefined) {
    openPlace("runs");
    return;
  }
  openItem({ kind: "run", hub: run.summary.hubId, id: run.summary.id });
}
