import { describe, expect, it } from "vitest";
import { EngineNotAnswering, NothingToRun, RoutinesHostService } from "./api.ts";

describe("RoutinesHostService", () => {
  it("is named so the app and the feature find the same service", () => {
    expect(RoutinesHostService.name).toBe("routines.host");
  });
});

describe("the errors a routines host rejects with", () => {
  it("says the engine isn't answering, as an unavailable error", () => {
    const error = new EngineNotAnswering();
    expect(error.kind).toBe("unavailable");
    expect(error.message).toBe("The engine isn't answering.");
  });

  it("says a hub with nothing to run needs a workflow or an agent first", () => {
    const error = new NothingToRun();
    expect(error.kind).toBe("invalid_input");
    expect(error.message).toBe("Create a workflow or an agent first; a routine runs one of them.");
  });
});
