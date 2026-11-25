import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { acme, type Desktop, startDesktop, testKey } from "./desktop-messaging.test-helper.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

/** Connects `halonic` in `workspace` the way Studio does, which records a change of its source. */
async function connect(on: Desktop, workspace: string): Promise<void> {
  await on.paperclipKey.handOver({ workspace, connection: "halonic", key: testKey, ...acme });
}

verifies("agent-host.messaging-changes-wait", () => {
  it("answers Studio's waiting look when its workspace changes, while another workspace's look keeps waiting", async () => {
    const on = await startDesktop();
    desktop = on;
    let otherAnswered = false;
    const otherLook = on.transport
      .request("POST /v1/messaging/changes", {
        workspace: on.otherWorkspace,
        after: 0,
        wait: true,
      })
      .then((answer) => {
        otherAnswered = true;
        return answer;
      });
    const reader = on.studio.changes()[Symbol.asyncIterator]();
    const firstChange = reader.next();
    // Studio's first look, which answers at once, gives it its starting number.
    await waitUntil("Studio's first look", () => on.answers.length === 1);

    await connect(on, on.workspace);

    expect(await firstChange).toEqual({ done: false, value: "paperclip:halonic" });
    expect(otherAnswered).toBe(false);
    await reader.return?.();
    await connect(on, on.otherWorkspace);
    expect(await otherLook).toEqual({
      status: 200,
      body: { next: 1, sources: ["paperclip:halonic"] },
    });
  });

  it("answers at once without `wait`, as before", async () => {
    const on = await startDesktop();
    desktop = on;

    const answer = await on.transport.request("POST /v1/messaging/changes", {
      workspace: on.workspace,
      after: 0,
    });

    expect(answer).toEqual({ status: 200, body: { next: 0, sources: [] } });
  });
});
