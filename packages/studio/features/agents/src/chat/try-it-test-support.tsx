import type { ChatAnswer, SandboxStartCheck } from "@halonicjs/app";
import { act } from "react";
import type { AgentChatRequest, AgentHarnessId } from "../api.ts";
import type { HarnessStrip } from "../configuration/harness-strip.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, typeIntoArea } from "../test-support.tsx";
import { TryItChatView, type TryItChatViewProps } from "./try-it-chat.tsx";
import { useTryItChat } from "./use-try-it-chat.ts";

export const sorter = {
  hubId: "acme",
  id: "sorter",
  name: "Sorter",
  description: "Sorts incoming mail by topic",
};

/** A host whose answers the test gives one by one, and what each request held. */
export function scriptedHost() {
  const requests: AgentChatRequest[] = [];
  const pending: ((answer: ChatAnswer | Error) => void)[] = [];
  const host = memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme" }],
    agents: [sorter],
    answer: (_ref, request) => {
      // A copy, since the chat's conversation grows after the request.
      requests.push({ ...request, messages: [...request.messages] });
      return new Promise((resolve, reject) => {
        pending.push((answer) => (answer instanceof Error ? reject(answer) : resolve(answer)));
      });
    },
  });
  /** Ends the oldest answer still being written. */
  const finish = async (answer: ChatAnswer | Error) => {
    await act(async () => pending.shift()?.(answer));
  };
  return { host, requests, finish };
}

/** The ways out of the line under the box, for a test that doesn't follow them. */
const noWays = { goToKeyField: () => {}, openHarness: () => {} };

/** An agent's Try it chat as the tests draw it: *Sorter*, on Claude Code unless they say. */
export function Chat({
  ways = noWays,
  host,
  announce,
  harnessStrip = null,
  harness = "claude-code",
  sandboxStartCheck,
}: {
  readonly host: ReturnType<typeof memoryAgentsHost>;
  readonly announce: (text: string, politeness?: "polite" | "assertive") => void;
  readonly harnessStrip?: HarnessStrip | null;
  readonly harness?: AgentHarnessId;
  readonly sandboxStartCheck?: SandboxStartCheck;
  readonly ways?: TryItChatViewProps["ways"];
}) {
  const chat = useTryItChat({ host, agent: sorter, name: "Sorter", announce });
  return (
    <TryItChatView
      chat={chat}
      name="Sorter"
      description={sorter.description}
      harness={harness}
      harnessStrip={harnessStrip}
      ways={ways}
      sandboxStartCheck={sandboxStartCheck}
      announce={announce}
    />
  );
}

export async function sendMessage(page: HTMLElement, text: string) {
  await typeIntoArea(page.querySelector("textarea") as HTMLTextAreaElement, text);
  await act(async () => buttonNamed(page, "Send")?.click());
}

export const said = (page: HTMLElement) =>
  [...page.querySelectorAll("[data-chat-message] p")].map((line) => line.textContent);
