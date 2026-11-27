import type { Conversation, Message, MessagingAgent } from "@halonicjs/ports";
import { act } from "react";
import type { MessagingList } from "../phone/messaging-client.ts";
import { PhoneMessenger } from "../phone/phone-messenger.tsx";
import { GatewayScene, SCENE_COMPUTER } from "./gateway-scene.ts";
import { render } from "./render.tsx";

/** A channel of Elena (its lead) and Liam, waiting for the person. */
export const channel: Conversation = {
  id: "c1",
  source: "acme",
  agent: "elena",
  members: ["elena", "liam"],
  title: "Engineering",
  updatedAt: "2026-11-25T10:00:00.000Z",
  waitingForMe: true,
};
const { members: _members, ...lead } = channel;
/** A direct chat with Elena, of the same source. */
export const direct: Conversation = { ...lead, id: "c2", title: "Chief" };

/** Elena and Liam, as the agents read answers them. */
export const agents: readonly MessagingAgent[] = [
  { id: "elena", source: "acme", name: "Elena", activity: "working" },
  { id: "liam", source: "acme", name: "Liam", activity: "idle" },
];

/** An agent's message from Elena in the channel, sent when the channel was last updated. */
export function message(body: string): Message {
  const author = { kind: "agent", agent: "elena", name: "Elena" } as const;
  return { id: "m1", conversation: "c1", author, body, attachments: [], sentAt: channel.updatedAt };
}

/** Lets the host's answers settle and React draw them. */
export const settle = () => act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));

/** The host answers the newest `msg-read` of `what` with `items`. */
export function answer(
  scene: GatewayScene,
  what: MessagingList | "messages" | "reactions",
  items: readonly unknown[],
) {
  const read = scene.tunnel.sentOf("msg-read").findLast((each) => each.what === what);
  scene.host({ type: "msg-data", replyTo: read?.id ?? "", what, items });
}

/** A Messenger tab over a connected host of `version` (the newest), before any read is answered. */
export function renderMessenger(version?: number) {
  const scene = new GatewayScene();
  if (version === undefined) scene.connect();
  else scene.connectAt(version);
  // The links the tab asked to open, in order.
  const opened: string[] = [];
  const onOpenLink = (link: string) => {
    opened.push(link);
  };
  render(
    <PhoneMessenger
      messaging={scene.client.messaging}
      computer={SCENE_COMPUTER}
      olderComputer={false}
      onOpenLink={onOpenLink}
    />,
  );
  return { scene, opened };
}

/**
 * A Messenger tab with `channel` and `direct` listed and `title`'s chat open on `messages`, over a
 * host of `version` (the newest).
 */
export async function openChat(title: string, messages: readonly Message[] = [], version?: number) {
  const { scene, opened } = renderMessenger(version);
  answer(scene, "conversations", [channel, direct]);
  answer(scene, "agents", agents);
  await settle();
  await act(async () => rowNamed(title)?.click());
  answer(scene, "messages", messages);
  await settle();
  return { scene, opened };
}

/** The Messenger tab with `channel` open. */
export const openChannel = (messages: readonly Message[] = []) => openChat("Engineering", messages);

/** A button by its accessible name or, without one, its text. */
export function buttonNamed(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find(
    (button) => (button.getAttribute("aria-label") ?? button.textContent) === name,
  );
}

/** A chat's row button in the list, by the chat's name. */
export function rowNamed(title: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("li[data-row-id] > button")].find(
    (button) => button.querySelector("bdi")?.textContent === title,
  );
}

/** Types `text` into the chat's box, as a person would. */
export function type(text: string) {
  act(() => {
    const box = document.querySelector("textarea");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, text);
    box?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** The live regions: a failed read's line first, then in a chat the line under the box. */
const statuses = () => [...document.querySelectorAll('[role="status"]')];
export const line = () => statuses().at(-1)?.textContent;
export const readLine = () => statuses()[0]?.textContent;
