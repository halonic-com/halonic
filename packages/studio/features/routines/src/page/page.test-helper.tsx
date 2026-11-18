import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { act } from "react";
import type { RoutinesHost, RoutineView } from "../api.ts";
import { buttonNamed, memoryHost, show } from "../test-support.tsx";
import { RoutineScreen } from "./routine-page.tsx";

/** The routine every page test reads, unless it says otherwise. */
export const daily: RoutineView = {
  hubId: "acme",
  id: "daily",
  name: "Daily",
  enabled: true,
  trigger: { kind: "schedule", cron: "30 7 * * 1-5" },
  triggerSentence: "Weekdays at 07:30",
  summary: "Weekdays at 07:30 → Briefing",
  targetName: "Briefing",
  target: { kind: "workflow", hubId: "acme", id: "briefing", input: "{}" },
  targetState: "ready",
  overlap: "skip",
  catchUp: "last",
  file: "hubs/acme/workflows/routines/daily.routine.yaml",
  everLive: true,
  changesNotLive: false,
  problems: [],
};

/** A host that reads `routine`, or rejects with `fail`, and tells its listeners about a change. */
export function hostReading(routine: () => RoutineView, fail?: () => Error | undefined) {
  const { host, change } = memoryHost([], []);
  const reading = {
    ...host,
    mailboxes: async () => [],
    targets: async () => [],
    nextTimes: async () => ({ times: [], atNextCheck: false }),
    read: async () => {
      const error = fail?.();
      if (error) throw error;
      return routine();
    },
  } as RoutinesHost;
  return { host: reading, change: () => change([]) };
}
export const screenOf = (host: RoutinesHost, id = "daily") => (
  <RoutineScreen host={host} hubId="acme" id={id} announce={() => {}} />
);

export async function showWithToasts(host: RoutinesHost, openRun?: (runId: string) => void) {
  const toasts = createToastStore();
  const page = await show(
    <ToastStoreProvider store={toasts}>
      <RoutineScreen
        host={host}
        hubId="acme"
        id="daily"
        announce={() => {}}
        goToRoutines={() => {}}
        {...(openRun && { openRun })}
      />
    </ToastStoreProvider>,
  );
  return { page, toasts };
}

export const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

export const runNowButton = (page: HTMLElement) => buttonNamed(page, "Run now");
