import { describe, expect, it } from "vitest";
import { WorkflowsHostService } from "./api.ts";

describe("WorkflowsHostService", () => {
  it("is named so the app and the feature find the same service", () => {
    expect(WorkflowsHostService.name).toBe("workflows.host");
  });
});
