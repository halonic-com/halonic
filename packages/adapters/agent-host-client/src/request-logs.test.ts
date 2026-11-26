import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostRequestLogs } from "./request-logs.ts";

const route = "POST /v1/integration-logs/read";
const line = { type: "request", at: "2026-11-26T08:00:00.000Z", path: "/v1/{…}" };

verifies("agent-host-client.request-logs", () => {
  it("asks for the window's workspace and gives the log lines, leaving out any other", async () => {
    const host = new FakeHost().answer(route, ok({ lines: [line, { type: "other" }, null] }));
    expect(await new AgentHostRequestLogs(host, "/work/acme").lines("notes")).toEqual([line]);
    expect(host.calls).toEqual([{ route, body: { location: "/work/acme", integration: "notes" } }]);
  });

  it("fails when the host refuses", async () => {
    const host = new FakeHost().answer(
      route,
      refused(422, "request_log_unreadable", "The request log can't be read."),
    );
    await expect(new AgentHostRequestLogs(host, "/work/acme").lines("notes")).rejects.toThrow();
  });
});
