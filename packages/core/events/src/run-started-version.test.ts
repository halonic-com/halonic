import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { RunEventBody, RunEventType } from "./run-event.ts";

// Type tests for the version of the workspace a run read, which a run view
// shows as "the version of <date>" or "the saved files".

type EventOf<T extends RunEventType> = Extract<RunEventBody, { type: T }>;

const started = {
  type: "run.started",
  hubId: "acme",
  workflowId: "briefing",
  input: {},
  kind: "run",
  definitionsVersion: "sha-1",
} as const;

verifies("events.run-started-version", () => {
  typeTest("takes the live version with its commit and date", () => {
    expectTypeOf({
      ...started,
      version: {
        reads: "live-version",
        commit: "4f2a9c1e",
        versionDate: "2026-11-10T09:42:00+01:00",
      },
    } as const).toExtend<EventOf<"run.started">>();
  });

  typeTest("takes the saved files", () => {
    expectTypeOf({ ...started, version: { reads: "saved-files" } } as const).toExtend<
      EventOf<"run.started">
    >();
  });

  typeTest("needs the live version's commit and date", () => {
    expectTypeOf({ ...started, version: { reads: "live-version" } } as const).not.toExtend<
      EventOf<"run.started">
    >();
  });

  typeTest("takes a run.started from before the version was recorded", () => {
    expectTypeOf(started).toExtend<EventOf<"run.started">>();
  });
});
