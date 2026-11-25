import type { NoticeTarget, RunNoticeClicks } from "@halonicjs/studio-services";
import type { DialogHostProps, WorkspaceContext } from "@halonicjs/studio-shell";
import { useEffect, useRef } from "react";
import { openRunNotice, RunNoticeClicksService } from "../notify/run-notice-open.ts";
import { RunsListService } from "../runs-list.ts";

/**
 * Opens what a click on a run notification names (requirement `runs.run-notification-open`): the
 * click that opened Studio's window once the page starts, then every later one. It draws nothing.
 * Without the shell's clicks, as in a browser, or without a way to open, it does nothing.
 */
export function RunNoticeHost({ context }: DialogHostProps) {
  const clicks = context.services.find(RunNoticeClicksService);
  // Read through a ref, so a new context on a later draw neither hears twice nor drops the
  // waiting click, which the shell hands over only once.
  const current = useRef(context);
  current.current = context;
  useEffect(() => {
    if (clicks === undefined) return;
    return followRunNotices(clicks, () => current.current);
  }, [clicks]);
  return null;
}

/**
 * The clicks whose waiting click has opened, so a host that starts again, as React's checks start
 * it twice, doesn't open it twice; one that stopped before it arrived leaves it to the next.
 */
const pendingOpened = new WeakSet<RunNoticeClicks>();

/**
 * Takes the waiting click, then hears the later ones, and opens each through the window's
 * context as it is then. Returns a function that stops hearing them.
 */
export function followRunNotices(
  clicks: RunNoticeClicks,
  context: () => WorkspaceContext,
): () => void {
  let stopped = false;
  // A click waiting for the runs' first load; a newer click, or stopping, cancels it.
  let cancelWait: () => void = () => undefined;
  const open = (target: NoticeTarget) => {
    const { services, openItem, openPlace } = context();
    if (stopped || openItem === undefined || openPlace === undefined) return;
    cancelWait();
    cancelWait = openRunNotice(target, {
      list: services.get(RunsListService),
      openItem,
      openPlace,
    });
  };
  void clicks.takePending().then((pending) => {
    if (pending === undefined || stopped || pendingOpened.has(clicks)) return;
    pendingOpened.add(clicks);
    open(pending);
  });
  const stopHearing = clicks.subscribe(open);
  return () => {
    stopped = true;
    cancelWait();
    stopHearing();
  };
}
