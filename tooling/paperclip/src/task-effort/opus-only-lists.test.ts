// The labels that keep a task on Opus are written down in four places,
// because the layer rules keep core packages from importing Paperclip's
// tooling and the signal rules allow type imports only (HAL-18805). This
// test is the one place that sees them all, so a label added to one list
// and not the others fails here instead of routing a risky task off Opus.

import { opusOnlyRunTags } from "@halonicjs/engine";
import { opusOnlyLabels } from "@halonicjs/retry-detectors";
import { describe, expect, test } from "vitest";
import { opusOnlyTags } from "../signals/rules/task-effort.ts";
import { opusOnlyAreas } from "./rules.ts";

/** A list's labels, sorted, so two lists compare equal whatever their order. */
const sorted = (labels: Iterable<string>): string[] => [...labels].sort();

describe("the Opus-only label lists", () => {
  const effortTable = sorted(["opus-only", ...opusOnlyAreas]);

  test.each([
    ["the engine's run effort", opusOnlyRunTags],
    ["the retry detectors' routing guard", opusOnlyLabels],
    ["the task effort signal rule", opusOnlyTags],
  ])("%s has the same labels as Paperclip's effort table", (_name, labels) => {
    expect(sorted(labels)).toEqual(effortTable);
  });
});
