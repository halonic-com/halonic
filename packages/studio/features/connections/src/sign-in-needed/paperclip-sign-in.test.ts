import {
  type AgentConnection,
  AgentConnectionsService,
  FakeAgentConnections,
} from "@halonicjs/studio-services";
import type { SignInReading, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { paperclipSignIn } from "./paperclip-sign-in.ts";

const acme: AgentConnection = {
  id: "paperclip:acme",
  provider: "paperclip",
  label: "Paperclip · Acme team",
  address: "https://paperclip.acme.test",
  state: { kind: "signed-out" },
};

const online: AgentConnection = {
  ...acme,
  id: "paperclip:zeta",
  label: "Paperclip · Zeta",
  state: { kind: "online", asOf: "2026-11-28T12:00:00.000Z" },
};

function contextWith(connections: FakeAgentConnections | undefined): WorkspaceContext {
  const find = (key: unknown) => (key === AgentConnectionsService ? connections : undefined);
  const get = (key: unknown) => {
    const found = find(key);
    if (found === undefined) throw new Error("No such service.");
    return found;
  };
  return { services: { find, get } } as unknown as WorkspaceContext;
}

verifies("connections.paperclip-sign-in-needed", () => {
  it("blocks the Inbox and the Messenger, not Studio's window", () => {
    expect(paperclipSignIn.blockingFor).toEqual(["inbox", "messenger"]);
    expect(paperclipSignIn.provider).toBe("Paperclip");
  });

  it("needs a sign-in for each signed-out Paperclip connection, named by its label", async () => {
    const readings: SignInReading[] = [];
    const stop = paperclipSignIn.watch(
      contextWith(new FakeAgentConnections({ connections: [acme, online] })),
      (reading) => readings.push(reading),
    );
    await vi.waitFor(() => expect(readings).toHaveLength(1));
    expect(readings[0]).toEqual({
      kind: "read",
      needs: [{ id: "paperclip:acme", name: "Paperclip · Acme team" }],
    });
    stop();
  });

  it("needs none where the engine serves no connections", () => {
    const readings: SignInReading[] = [];
    paperclipSignIn.watch(contextWith(undefined), (reading) => readings.push(reading));
    expect(readings).toEqual([{ kind: "read", needs: [] }]);
  });

  it("reports a list it can't read", async () => {
    const connections = new FakeAgentConnections();
    const error = new Error("The agent host didn't answer.");
    vi.spyOn(connections, "list").mockRejectedValue(error);
    const readings: SignInReading[] = [];
    paperclipSignIn.watch(contextWith(connections), (reading) => readings.push(reading));
    await vi.waitFor(() => expect(readings).toEqual([{ kind: "unreadable", error }]));
  });

  it("signs the connection in again, with its phrase and approval page, and ends signed in", async () => {
    const connections = new FakeAgentConnections({ connections: [acme], phrase: "blue otter" });
    const attempt = await paperclipSignIn.start(contextWith(connections), "paperclip:acme");

    expect(connections.signIns).toEqual([
      { address: "https://paperclip.acme.test", connection: "paperclip:acme" },
    ]);
    expect(attempt.phrase).toBe("blue otter");
    expect(attempt.approvalUrl).toBe("https://paperclip.acme.test/cli-auth/fake-challenge");
    connections.approve("Paperclip · Acme team");
    await expect(attempt.finished).resolves.toBe("signed-in");
  });

  it("fails a sign-in that expires, and one Paperclip refuses to start", async () => {
    const expiring = new FakeAgentConnections({ connections: [acme] });
    const attempt = await paperclipSignIn.start(contextWith(expiring), "paperclip:acme");
    expiring.expire();
    await expect(attempt.finished).resolves.toBe("failed");

    const refusing = new FakeAgentConnections({ connections: [acme], refuseStart: "unreachable" });
    await expect(paperclipSignIn.start(contextWith(refusing), "paperclip:acme")).rejects.toThrow(
      /unreachable/,
    );
  });
});
