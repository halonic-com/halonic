// @vitest-environment jsdom
import type { ChatTurnRefusal } from "@halonicjs/ports";
import { type EngineWords, engineWords } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ConnectorStatus,
  ConnectorStatusHost,
  RecordedRefusal,
} from "../connector-status-host.ts";
import { ConnectorStatusModel } from "../connector-status-model.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectorStatusSection } from "./connector-status-section.tsx";

afterEach(unmountAll);

const notes: ConnectorStatus = {
  id: "notes",
  name: "Notes",
  state: "needs-sign-in",
  reason: "The account isn't signed in on this computer.",
};

function refusal(index: number): ChatTurnRefusal {
  return { source: "notes", name: `tool ${index}`, refused: "tool", reason: `why ${index}` };
}

/** A host the test steers: what it answers now, and a way to say "something changed". */
function fakeHost(answer: { connectors: ConnectorStatus[]; refusals: ChatTurnRefusal[] }) {
  const listeners = new Set<() => void>();
  const host: ConnectorStatusHost & { fail?: Error } = {
    async list() {
      if (host.fail !== undefined) throw host.fail;
      return answer.connectors;
    },
    async refusals() {
      if (host.fail !== undefined) throw host.fail;
      return answer.refusals.map(
        (refusal) => ({ refusal, at: new Date(0) }) satisfies RecordedRefusal,
      );
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    host,
    changed: () => {
      for (const listener of listeners) listener();
    },
  };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openSection(
  host: ConnectorStatusHost,
  announceState?: () => void,
  words?: EngineWords,
) {
  const model = new ConnectorStatusModel(host, "notes");
  const root = render(
    <ConnectorStatusSection
      model={model}
      {...(words === undefined ? {} : { words })}
      {...(announceState === undefined ? {} : { announceState })}
    />,
  );
  await settled();
  return { root, model };
}

const lines = (root: HTMLElement) =>
  [...root.querySelectorAll("li span")].map((item) => item.textContent);

verifies("library.status-section", () => {
  describe("with an answer", () => {
    it("shows the state as a word with its sentence, then the refusals as plain lines", async () => {
      const { host } = fakeHost({ connectors: [notes], refusals: [refusal(1), refusal(2)] });
      const { root } = await openSection(host);
      expect(root.textContent).toContain("Needs sign-in");
      expect(root.textContent).toContain("isn't signed in on this computer.");
      expect(root.querySelector("h2")?.textContent).toBe("Recent refusals");
      expect(lines(root)).toEqual([
        'notes: left out "tool 1": why 1',
        'notes: left out "tool 2": why 2',
      ]);
    });

    it("shows the time of each refusal", async () => {
      const { host } = fakeHost({ connectors: [notes], refusals: [refusal(1), refusal(2)] });
      const { root } = await openSection(host);
      const times = [...root.querySelectorAll("li time")];
      expect(times).toHaveLength(2);
      for (const time of times) {
        expect(time.getAttribute("datetime")).toBe(new Date(0).toISOString());
      }
    });

    it("names the list by its heading, as a list, and draws no landmark or live region", async () => {
      const { host } = fakeHost({ connectors: [notes], refusals: [refusal(1)] });
      const { root } = await openSection(host);
      const list = root.querySelector("ul");
      expect(list?.getAttribute("role")).toBe("list");
      expect(list?.getAttribute("aria-labelledby")).toBe(root.querySelector("h2")?.id);
      expect(root.querySelector("main, nav, section, [aria-live], [role=status]")).toBeNull();
    });

    it("shows a refusal as text, never as markup", async () => {
      const markup: ChatTurnRefusal = {
        source: "notes",
        refused: "listing",
        reason: "<b>bold</b> [link](x)",
      };
      const { host } = fakeHost({ connectors: [notes], refusals: [markup] });
      const { root } = await openSection(host);
      expect(root.querySelector("li b")).toBeNull();
      expect(lines(root)[0]).toContain("<b>bold</b> [link](x)");
    });

    it("lets a long line wrap instead of cutting it", async () => {
      const long = { ...refusal(1), reason: "x".repeat(300) };
      const { host } = fakeHost({ connectors: [notes], refusals: [long] });
      const { root } = await openSection(host);
      const item = root.querySelector("li");
      expect(item?.className).toContain("[overflow-wrap:anywhere]");
      expect(item?.className).not.toMatch(/nowrap|truncate|line-clamp/);
      expect(lines(root)[0]).toContain("x".repeat(300));
    });

    it("notes that the list stops at 20, and only then", async () => {
      const many = Array.from({ length: 25 }, (_, index) => refusal(index));
      const { host } = fakeHost({ connectors: [notes], refusals: many });
      const { root } = await openSection(host);
      expect(lines(root)).toHaveLength(20);
      expect(root.textContent).toContain("Showing the last 20 refusals.");

      const few = fakeHost({ connectors: [notes], refusals: many.slice(0, 3) });
      const { root: fewRoot } = await openSection(few.host);
      expect(fewRoot.textContent).not.toContain("Showing the last 20 refusals.");
    });
  });

  describe("without refusals, loading, and failing", () => {
    it("says nothing was refused only after the host answered with none", async () => {
      const pending: ConnectorStatusHost = {
        list: () => new Promise(() => {}),
        refusals: () => new Promise(() => {}),
        subscribe: () => () => {},
      };
      const loading = await openSection(pending);
      expect(loading.root.textContent).toContain("Loading refusals");
      expect(loading.root.textContent).not.toContain("Nothing refused");

      const { host } = fakeHost({ connectors: [notes], refusals: [] });
      const { root } = await openSection(host);
      expect(root.querySelectorAll("p").length).toBeGreaterThan(0);
      expect(root.textContent).toContain("Nothing refused since Halonic started.");
      expect(root.querySelector("ul")).toBeNull();
      expect(root.querySelector("h2")?.textContent).toBe("Recent refusals");
    });

    it("shows that refusals couldn't load when the first answer fails, and Try again asks again", async () => {
      const fake = fakeHost({ connectors: [notes], refusals: [refusal(1)] });
      fake.host.fail = new Error("connection reset");
      const { root } = await openSection(fake.host);
      expect(root.textContent).toContain("Couldn't load refusals");
      expect(root.textContent).not.toContain("Nothing refused");
      delete fake.host.fail;
      const retry = [...root.querySelectorAll("button")].find(
        (button) => button.textContent === "Try again",
      );
      await act(async () => retry?.click());
      await settled();
      expect(lines(root)).toHaveLength(1);
    });

    it("says the engine isn't answering when a later answer fails, and keeps what it showed", async () => {
      const fake = fakeHost({ connectors: [notes], refusals: [refusal(1)] });
      const { root } = await openSection(fake.host);
      fake.host.fail = new Error("gone");
      await act(async () => fake.changed());
      await settled();
      expect(root.textContent).toContain("The engine isn't answering. Showing what it said last.");
      expect(lines(root)).toHaveLength(1);
      expect(root.textContent).toContain("Needs sign-in");
    });
  });

  describe("on another host", () => {
    it("words the lost engine for the phone, not the desktop app", async () => {
      const fake = fakeHost({ connectors: [notes], refusals: [refusal(1)] });
      const { root } = await openSection(fake.host, undefined, engineWords.phone);
      fake.host.fail = new Error("gone");
      await act(async () => fake.changed());
      await settled();
      expect(root.textContent).toContain(
        "Halonic on your computer isn't answering. Showing what it said last.",
      );
      expect(root.textContent).not.toContain("The engine isn't answering");
    });
  });

  describe("announcements", () => {
    it("announces a state change once, and nothing on first load", async () => {
      const answer = { connectors: [notes], refusals: [] as ChatTurnRefusal[] };
      const fake = fakeHost(answer);
      const announce = vi.fn();
      await openSection(fake.host, announce);
      expect(announce).not.toHaveBeenCalled();

      answer.connectors = [{ ...notes, state: "connected" }];
      await act(async () => fake.changed());
      await settled();
      expect(announce).toHaveBeenCalledOnce();
      expect(announce).toHaveBeenCalledWith("connector:notes", "Notes: Connected.");

      await act(async () => fake.changed());
      await settled();
      expect(announce).toHaveBeenCalledOnce();
    });
  });
});
