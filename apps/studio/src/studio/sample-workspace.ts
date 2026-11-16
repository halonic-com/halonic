import {
  type SampleStepId,
  type SampleWorkspace,
  sampleSteps,
} from "@halonicjs/studio-feature-first-run/api";
import type { RecentStorage, RecentWorkspaces } from "@halonicjs/studio-feature-workspace";

/** The storage key for the steps done in one folder; the folder's location is the key, as Recent's. */
function stepsKey(location: string): string {
  return `halonic.first-run.steps.${location}`;
}

/** The steps saved in `text`; text that isn't a list of steps counts as none. */
function parseSteps(text: string | null): readonly SampleStepId[] {
  if (text === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? sampleSteps.filter((step) => parsed.includes(step)) : [];
}

/**
 * What the first run knows of the folder open in the window (`studio.sample-workspace`): whether
 * Recent remembers it as the Acme sample, and which steps of the Try the sample card are done in
 * it on this device. Like Recent, a list that can't be read counts as empty and one that can't be
 * written stays as it was, so the card never stops Home from opening.
 *
 * @example
 * const sample = sampleWorkspaceOf("/work/Acme sample", recent, window.localStorage);
 * sample.recordDone("start");
 */
export function sampleWorkspaceOf(
  location: string,
  recent: RecentWorkspaces,
  storage: RecentStorage,
): SampleWorkspace {
  const read = (): readonly SampleStepId[] => {
    try {
      return parseSteps(storage.getItem(stepsKey(location)));
    } catch {
      return [];
    }
  };
  return {
    isSample: () => recent.isSample(location),
    doneSteps: read,
    recordDone: (step) => {
      const done = new Set([...read(), step]);
      try {
        storage.setItem(
          stepsKey(location),
          JSON.stringify(sampleSteps.filter((each) => done.has(each))),
        );
      } catch {
        // Storage is full or blocked: the step stays done in this window, and the next one tries again.
      }
    },
  };
}
