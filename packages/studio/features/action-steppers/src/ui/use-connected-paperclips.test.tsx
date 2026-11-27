// @vitest-environment jsdom
import type { AgentConnection, AgentConnections } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { useConnectedPaperclips } from "./use-connected-paperclips.ts";

/** The `acme` Paperclip, as Settings lists it before its first sign-in on this computer. */
const acme: AgentConnection = {
  id: "paperclip:acme",
  provider: "paperclip",
  label: "Paperclip · Acme",
  address: "https://paperclip.acme.example",
  state: { kind: "no-key" },
};

/** Connections whose list the test changes, telling whoever listens. */
function connectionsOf(listed: AgentConnection[]) {
  const listeners = new Set<() => void>();
  const connections: AgentConnections = {
    list: () => Promise.resolve(listed),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signIn: () => Promise.reject(new Error("not in this test")),
    disconnect: () => Promise.reject(new Error("not in this test")),
  };
  const change = async (next: AgentConnection[]) => {
    listed = next;
    await act(async () => {
      for (const listener of listeners) listener();
    });
  };
  return { connections, change };
}

function Hosts({ connections }: { readonly connections: AgentConnections | undefined }) {
  const paperclips = useConnectedPaperclips(connections);
  const shown = paperclips.map(({ host, hasKey }) => `${host}${hasKey ? " (key)" : ""}`);
  return <p>{shown.join(" ") || "none"}</p>;
}

afterEach(unmountAll);

verifies("action-steppers.paperclip-host", () => {
  describe("useConnectedPaperclips", () => {
    it("reads the connected Paperclips, and again when they change", async () => {
      const { connections, change } = connectionsOf([acme]);
      const container = render(<Hosts connections={connections} />);
      await act(async () => {});
      expect(container.textContent).toBe("paperclip.acme.example");
      await change([{ ...acme, state: { kind: "online", asOf: "2026-11-27T09:00:00.000Z" } }]);
      expect(container.textContent).toBe("paperclip.acme.example (key)");
      await change([]);
      expect(container.textContent).toBe("none");
    });

    it("has none without connections, as in a browser", () => {
      expect(render(<Hosts connections={undefined} />).textContent).toBe("none");
    });
  });
});
