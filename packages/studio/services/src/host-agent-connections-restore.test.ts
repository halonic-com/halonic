import type {
  PaperclipConnectionRow,
  PaperclipSignInState,
} from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { HostAgentConnections } from "./host-agent-connections.ts";

const address = "https://paperclip.acme.test";
const company = "acme-company";
const online = { kind: "online", asOf: "2026-11-25T22:00:00.000Z" } as const;

/**
 * The agent host and the Studio shell after a restart. The shell's restore
 * (`agent_host_paperclip_restore`) decides what goes back and answers how
 * many keys did; which keys and to which workspace is tested in Rust
 * (`studio.src-tauri.paperclip-key-keep`, HAL-20278). Here it answers as told.
 */
class FakeShell {
  /** The workspaces the page asked the shell to restore, in order. */
  readonly asked: string[] = [];
  /** How many restores fail first, as while the host can't list the workspace yet. */
  restoresRefused = 0;
  /** How many keys the next restore that succeeds gives back. */
  keysBack = 1;
  #restored = false;

  readonly restoreKeys = async (workspace: string): Promise<number> => {
    this.asked.push(workspace);
    if (this.restoresRefused > 0) {
      this.restoresRefused--;
      throw new Error("the agent host couldn't list the workspace's connections");
    }
    this.#restored = this.keysBack > 0;
    return this.keysBack;
  };

  readonly signIn = {
    listed: async () => ({ workspace: "/real/acme", connections: [this.#row()] }),
    start: async () => ({ outcome: "refused" as const, reason: "unreachable" as const }),
    poll: async (): Promise<PaperclipSignInState> => ({ status: "pending" }),
    cancel: async () => ({ status: "cancelled" as const }),
  };

  #row(): PaperclipConnectionRow {
    return {
      id: "paperclip:halonic",
      name: "halonic",
      label: "Paperclip · Halonic",
      address,
      company,
      state: this.#restored ? online : { kind: "no-key" },
    };
  }
}

/** Opens the workspace Studio names `/links/acme`, as after a start. */
function open(shell: FakeShell) {
  const reported: unknown[] = [];
  const connections = new HostAgentConnections({
    signIn: shell.signIn,
    host: { disconnect: async () => ({ revoked: true }) },
    restoreKeys: shell.restoreKeys,
    workspace: "/links/acme",
    wait: async () => {},
    now: () => Date.parse("2026-11-25T22:00:00.000Z"),
    report: (error) => reported.push(error),
  });
  let heard = 0;
  connections.subscribe(() => heard++);
  return { connections, reported, heard: () => heard };
}

verifies("services.paperclip-restore", () => {
  describe("HostAgentConnections.restore, after Studio restarts", () => {
    it("asks the shell once, naming the workspace as Studio names it, and says a key came back", async () => {
      const shell = new FakeShell();
      const { connections, reported, heard } = open(shell);

      await connections.restore();

      expect(shell.asked).toEqual(["/links/acme"]);
      expect(heard()).toBe(1);
      expect(reported).toEqual([]);
      expect((await connections.list())[0]?.state).toEqual(online);
      expect(shell.asked).toHaveLength(1);
    });

    it("tells no one when no key came back", async () => {
      const shell = new FakeShell();
      shell.keysBack = 0;
      const { connections, heard } = open(shell);

      await connections.restore();

      expect(heard()).toBe(0);
    });

    it("asks again at the next list when the shell's restore failed at the start", async () => {
      const shell = new FakeShell();
      shell.restoresRefused = 1;
      const { connections, reported } = open(shell);

      await connections.restore();
      expect(reported).toHaveLength(1);

      const listed = await connections.list();
      expect(shell.asked).toEqual(["/links/acme", "/links/acme"]);
      expect(listed[0]?.state).toEqual(online);
    });

    it("asks nothing again once a restore succeeded, even when no key came back", async () => {
      const shell = new FakeShell();
      shell.keysBack = 0;
      const { connections } = open(shell);

      await connections.restore();
      await connections.list();
      await connections.list();

      expect(shell.asked).toHaveLength(1);
    });

    it("asks nothing in a workspace that never asked for a restore, such as an untrusted one", async () => {
      const shell = new FakeShell();
      const { connections } = open(shell);

      await connections.list();

      expect(shell.asked).toEqual([]);
    });
  });
});
