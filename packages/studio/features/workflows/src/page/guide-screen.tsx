import { loadView } from "@halonicjs/studio-shell";
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from "react";
import type {
  WorkflowGuide,
  WorkflowGuideRun,
  WorkflowGuideScreen,
  WorkflowGuideScreenProps,
  WorkflowRef,
} from "../api.ts";

/**
 * The guide's screen for this workflow now, read again whenever the guide says it may have
 * changed; `undefined` without a guide or a screen.
 */
export function useGuideScreen(
  guide: WorkflowGuide | undefined,
  workflow: WorkflowRef,
): WorkflowGuideScreen | undefined {
  const [, setChanges] = useState(0);
  useEffect(() => {
    if (guide?.screen === undefined) return;
    const changed = () => setChanges((count) => count + 1);
    const stop = guide.subscribe(changed);
    // A change between the first read and this subscription would go unseen, so read once more.
    changed();
    return stop;
  }, [guide]);
  return screenOf(guide, workflow);
}

/**
 * What the guide adds while the run `runId` shows on this workflow's page, read again whenever the
 * guide says it may have changed; `undefined` without a guide, a shown run or additions. When the
 * guide takes the run off the page (`dismissed`), `onDismissed` closes its card.
 */
export function useGuideRun(
  guide: WorkflowGuide | undefined,
  workflow: WorkflowRef,
  runId: string | undefined,
  onDismissed: () => void,
): WorkflowGuideRun | undefined {
  const [, setChanges] = useState(0);
  useEffect(() => {
    if (guide?.run === undefined) return;
    const changed = () => setChanges((count) => count + 1);
    const stop = guide.subscribe(changed);
    changed();
    return stop;
  }, [guide]);
  const additions = runOf(guide, workflow, runId);
  const dismissed = additions?.dismissed === true;
  // The page hands a new `onDismissed` on every draw: the card closes when the run is dismissed.
  const close = useRef(onDismissed);
  close.current = onDismissed;
  useEffect(() => {
    if (dismissed) close.current();
  }, [dismissed]);
  return additions;
}

/** The guide's additions to the run, or none when the guide fails to give them. */
function runOf(
  guide: WorkflowGuide | undefined,
  workflow: WorkflowRef,
  runId: string | undefined,
): WorkflowGuideRun | undefined {
  if (guide?.run === undefined || runId === undefined) return undefined;
  try {
    return guide.run(workflow, runId);
  } catch (error) {
    console.error(`The guide couldn't say what it adds to run "${runId}".`, error);
    return undefined;
  }
}

/** The guide's screen, or none when the guide fails to give one: its fault mustn't break the page. */
function screenOf(
  guide: WorkflowGuide | undefined,
  workflow: WorkflowRef,
): WorkflowGuideScreen | undefined {
  if (guide?.screen === undefined) return undefined;
  try {
    return guide.screen(workflow);
  } catch (error) {
    console.error(`The guide couldn't give a screen for "${workflow.id}".`, error);
    return undefined;
  }
}

type Loaded =
  | { readonly of: WorkflowGuideScreen; readonly View: ComponentType<WorkflowGuideScreenProps> }
  | { readonly of: WorkflowGuideScreen; readonly failed: true };

/** Props for {@link GuideScreen}. */
export interface GuideScreenProps extends WorkflowGuideScreenProps {
  readonly screen: WorkflowGuideScreen;
  /** Reads a line aloud, once, through the window's announcer. */
  readonly announce?: ((line: string) => void) | undefined;
  /** What the page shows when the screen's view can't be loaded: the page itself. */
  readonly fallback: ReactNode;
}

/**
 * A guide's screen in place of the workflow's page (`workflows.page.guide-screen`): its view,
 * loaded once per screen, with its title read aloud when it shows. Until the view has loaded the
 * page shows nothing in its place; a view that fails to load leaves the page as it is.
 */
export function GuideScreen({ screen, announce, fallback, ...props }: GuideScreenProps) {
  const [loaded, setLoaded] = useState<Loaded | undefined>();
  useEffect(() => {
    let current = true;
    loadView<ComponentType<WorkflowGuideScreenProps>>(screen).then(
      (View) => current && setLoaded({ of: screen, View }),
      (error: unknown) => {
        console.error(`The guide's screen "${screen.title}" couldn't load.`, error);
        if (current) setLoaded({ of: screen, failed: true });
      },
    );
    return () => {
      current = false;
    };
  }, [screen]);
  // The page hands a new `announce` on every draw: the title is read when it changes, not then.
  const announceLine = useRef(announce);
  announceLine.current = announce;
  useEffect(() => {
    announceLine.current?.(screen.title);
  }, [screen.title]);
  if (loaded === undefined || loaded.of !== screen) return null;
  if ("failed" in loaded) return fallback;
  const { View } = loaded;
  return <View {...props} />;
}

/** The workflow's page, or the guide's screen in its place while the guide has one. */
export function pageOrGuideScreen(
  page: ReactNode,
  screen: WorkflowGuideScreen | undefined,
  props: Omit<GuideScreenProps, "screen" | "fallback">,
): ReactNode {
  if (screen === undefined) return page;
  return <GuideScreen screen={screen} fallback={page} {...props} />;
}
