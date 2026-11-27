import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkspaceMayStart } from "../paperclip/workspace-may-start.ts";
import { type Desktop, startDesktop } from "./desktop-messaging.test-helper.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

/** Lists the set-up workspace's connections with `fields` added to the body. */
async function listed(on: Desktop, fields: object = {}) {
  return on.transport.request("POST /v1/paperclip/connections", {
    workspace: on.workspace,
    ...fields,
  });
}

verifies("agent-host.paperclip-may-start", () => {
  it("answers whether the workspace may start a run when the shell asks", async () => {
    const mayStart = vi.fn<WorkspaceMayStart>(async () => false);
    desktop = await startDesktop({ mayStart });

    const answer = await listed(desktop, { mayStart: true });

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ workspace: desktop.workspace, mayStart: false });
    expect(mayStart).toHaveBeenCalledWith(desktop.workspace);

    mayStart.mockResolvedValue(true);
    expect((await listed(desktop, { mayStart: true })).body).toMatchObject({ mayStart: true });
  });

  it("runs no trust check and answers no mayStart for Settings › Connections", async () => {
    const mayStart = vi.fn<WorkspaceMayStart>(async () => true);
    desktop = await startDesktop({ mayStart });

    const answer = await listed(desktop);

    expect(answer.status).toBe(200);
    expect(answer.body).not.toHaveProperty("mayStart");
    expect(mayStart).not.toHaveBeenCalled();
  });

  it("answers that the workspace may not start a run when the host has no run gate", async () => {
    desktop = await startDesktop({ noRunGate: true });
    expect((await listed(desktop, { mayStart: true })).body).toMatchObject({ mayStart: false });
  });

  it("answers that the workspace may not start a run when the run gate fails", async () => {
    desktop = await startDesktop({ mayStart: () => Promise.reject(new Error("unreadable")) });
    const answer = await listed(desktop, { mayStart: true });
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ mayStart: false });
  });

  it("refuses a mayStart that isn't true", async () => {
    desktop = await startDesktop();
    expect((await listed(desktop, { mayStart: false })).status).toBe(400);
  });
});
