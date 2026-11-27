// @vitest-environment jsdom
import type { AgentConnection, AgentConnections } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
function connectionsOf(listed: AgentConnection[], list = () => Promise.resolve(listed)) {
  const listeners = new Set<() => void>();
  const connections: AgentConnections = {
    list,
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
  const read = useConnectedPaperclips(connections);
  if (read.kind !== "read") return <p>{read.kind}</p>;
  const shown = read.paperclips.map(({ host, hasKey }) => `${host}${hasKey ? " (key)" : ""}`);
  return <p>{shown.join(" ") || "none"}</p>;
}

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

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

    it("is loading until the first read finishes, never none", async () => {
      const listed = Promise.withResolvers<AgentConnection[]>();
      const { connections } = connectionsOf([], () => listed.promise);
      const container = render(<Hosts connections={connections} />);
      await act(async () => {});
      expect(container.textContent).toBe("loading");
      await act(async () => listed.resolve([acme]));
      expect(container.textContent).toBe("paperclip.acme.example");
    });

    it("says the read failed when the connections can't be read", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { connections } = connectionsOf([], () => Promise.reject(new Error("no answer")));
      const container = render(<Hosts connections={connections} />);
      await act(async () => {});
      expect(container.textContent).toBe("failed");
    });

    it("has none without connections, as in a browser", () => {
      expect(render(<Hosts connections={undefined} />).textContent).toBe("none");
    });
  });
});
