// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { AgentLiveState, AgentsHost } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, show, unmount } from "../test-support.tsx";
import { AgentScreen } from "./agent-page.tsx";

afterEach(unmount);

const line = "Changes not live yet";
const link = "Review and make live";

/**
 * Sorter, `not-live` until a version is made, with `makeLive` answering `answer` (or rejecting
 * with it when it is an error); `asked` counts the times it was asked.
 */
function hostMaking(answer: "made" | "cancelled" | Error) {
  let state: AgentLiveState = "not-live";
  const asked = { makeLive: 0 };
  const base = memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ hubId: "acme", id: "sorter", name: "Sorter" }],
  });
  const host: AgentsHost = {
    ...base,
    liveState: async () => state,
    makeLive: async () => {
      asked.makeLive += 1;
      if (answer instanceof Error) throw answer;
      if (answer === "made") state = "live";
      return answer;
    },
  };
  return { host, asked };
}

async function open(host: AgentsHost) {
  const toasts = createToastStore();
  const page = await show(
    <ToastStoreProvider store={toasts}>
      <AgentScreen host={host} hubId="acme" id="sorter" />
    </ToastStoreProvider>,
  );
  return { page, toasts };
}

verifies("agents.page.review-and-make-live", () => {
  it("ends the line in Review and make live, and reads the live state again once a version is made", async () => {
    const { host, asked } = hostMaking("made");
    const { page } = await open(host);
    expect(page.textContent).toContain(`${line} ${link}`);

    await act(async () => buttonNamed(page, link)?.click());
    expect(asked.makeLive).toBe(1);
    expect(page.textContent).not.toContain(line);
  });

  it("keeps the line when the person closes Create version without a version", async () => {
    const { host, asked } = hostMaking("cancelled");
    const { page, toasts } = await open(host);

    await act(async () => buttonNamed(page, link)?.click());
    expect(asked.makeLive).toBe(1);
    expect(page.textContent).toContain(line);
    expect(toasts.list()).toEqual([]);
  });

  it("says in a toast that the agent couldn't be made live, with the reason", async () => {
    const { host } = hostMaking(new KindedError("unavailable", "No room."));
    const { page, toasts } = await open(host);

    await act(async () => buttonNamed(page, link)?.click());
    expect(toasts.list()[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't make Sorter live.",
      text: "No room.",
    });
    expect(page.textContent).toContain(line);
  });

  it("has no link where the host can't make an agent live, or while the agent is live", async () => {
    const { makeLive: _makeLive, ...cannotMake } = hostMaking("made").host;
    const withoutMakeLive = await open(cannotMake);
    expect(withoutMakeLive.page.textContent).toContain(line);
    expect(buttonNamed(withoutMakeLive.page, link)).toBeUndefined();
    unmount();

    const live: AgentsHost = { ...hostMaking("made").host, liveState: async () => "live" };
    expect(buttonNamed((await open(live)).page, link)).toBeUndefined();
  });
});
