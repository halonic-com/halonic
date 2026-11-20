import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { fakeShell, serviceOn } from "./engine-service.testing.ts";

verifies("studio.inbox-request-trigger", () => {
  it("records an inbox trigger for a run the Inbox's request form starts", async () => {
    const service = serviceOn(fakeShell());
    // Only the request the executor gets matters here, so the run itself never starts.
    const start = vi
      .spyOn((await service.open()).executor, "start")
      .mockResolvedValue({ id: "run_1" } as RunSummary);

    await service.startRun({ hubId: "support", workflowId: "reply" }, {}, "inbox");

    const trigger = { type: "inbox", at: "2026-11-15T10:00:00.000Z" };
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ trigger }));
    await service.close();
  });
});
