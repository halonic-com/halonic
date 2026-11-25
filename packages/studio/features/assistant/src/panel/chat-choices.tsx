import {
  Button,
  ChevronDownIcon,
  Menu,
  type MenuEntry,
  type MenuTriggerProps,
  SparkIcon,
} from "@halonicjs/studio-kit";
import { useCallback, useEffect, useState } from "react";
import type { AssistantHost, Chat, ChatAgent, ChatKind, ChatModel, ModelOption } from "../api.ts";
import { chatWithWords as words } from "../chat/chat-with-words.ts";
import { ChatAgentOrb } from "./agent-chat.tsx";

/**
 * What the chips offer: the Build chat's models and the workspace's agents. `read` is false until
 * they are read, so an empty list means the workspace has none only once it is true.
 */
export interface ChatChoices {
  readonly models: readonly ModelOption[];
  readonly agents: readonly ChatAgent[];
  readonly read: boolean;
}

const none: ChatChoices = { models: [], agents: [], read: false };

/** {@link ChatChoices} as the panel follows them, with `again` to read them once more. */
export interface ReadChoices extends ChatChoices {
  /** Reads the models and agents again, as after the person set a key elsewhere, and gives them. */
  readonly again: () => Promise<ChatChoices>;
}

/**
 * The models and agents of the open workspace, read again for each chat shown, so an alias or an
 * agent added since shows. Until they are read, the chips show the chat's own choice.
 */
export function useChatChoices(host: AssistantHost, chatId: string | undefined): ReadChoices {
  const [choices, setChoices] = useState<ChatChoices>(none);
  useEffect(() => {
    if (chatId === undefined) return;
    let current = true;
    void readChoices(host).then((read) => current && setChoices(read));
    return () => {
      current = false;
    };
  }, [host, chatId]);
  const again = useCallback(async () => {
    const read = await readChoices(host);
    setChoices(read);
    return read;
  }, [host]);
  return { ...choices, again };
}

function readChoices(host: AssistantHost): Promise<ChatChoices> {
  return Promise.all([host.models(), host.agents()]).then(
    ([models, agents]) => ({ models, agents, read: true }),
    // The chips keep the chat's own choice; picking another waits for the next read.
    () => none,
  );
}

/** The agent a chat talks to, or `undefined` for a Build chat or an agent no longer there. */
export function agentOf(chat: Chat, choices: ChatChoices): ChatAgent | undefined {
  return choices.agents.find((agent) => agent.kind === chat.kind);
}

/** The props of {@link ChatChips}. */
export interface ChatChipsProps {
  readonly chat: Chat;
  readonly choices: ChatChoices;
  /** Chat with: a new chat of that kind; without it there's no Chat with chip (flow-assistant 2.4). */
  readonly onChatWith?: ((kind: ChatKind) => void) | undefined;
  readonly onModel: (model: ChatModel) => void;
}

/**
 * **Chat with: Build ▾** and **Model: smart ▾** above the box (flow-assistant 5.2, 5.3; component
 * specs 21). An agent chat shows its agent's model as text, not a menu.
 */
export function ChatChips({ chat, choices, onChatWith, onModel }: ChatChipsProps) {
  const agent = agentOf(chat, choices);
  const chatWith: MenuEntry[] = [
    {
      id: "build",
      label: words.buildTheWorkspace,
      icon: <SparkIcon />,
      checked: chat.kind === "build",
      onSelect: () => onChatWith?.("build"),
    },
    ...(choices.agents.length === 0 ? [] : ["divider" as const]),
    ...choices.agents.map((each) => ({
      id: each.kind,
      label: each.name,
      icon: <ChatAgentOrb kind={each.kind} agents={choices.agents} size={16} />,
      checked: each.kind === chat.kind,
      onSelect: () => onChatWith?.(each.kind),
    })),
  ];
  return (
    <div className="flex flex-wrap items-center gap-1 px-4 pt-2">
      {onChatWith === undefined ? null : (
        <Menu
          entries={chatWith}
          trigger={(props) => (
            <Chip trigger={props} label={words.chatWith} value={agent?.name ?? words.build} />
          )}
        />
      )}
      {chat.kind === "build" ? (
        <Menu
          entries={modelEntries(chat.model, choices.models, onModel)}
          trigger={(props) => (
            <Chip trigger={props} label={words.model} value={modelLabel(chat.model, choices)} />
          )}
        />
      ) : (
        <p className="px-2 text-small text-fg-muted">
          {agent === undefined ? null : words.agentModel(agent.model, agent.name)}
        </p>
      )}
    </div>
  );
}

/** The Model menu: each model with a check on the chat's, one that can't be used with its reason. */
function modelEntries(
  chosen: ChatModel,
  models: readonly ModelOption[],
  onModel: (model: ChatModel) => void,
): MenuEntry[] {
  return models.map((option) => ({
    id: option.model.kind === "alias" ? `alias:${option.model.name}` : "assistant",
    label: option.model.kind === "assistant" ? `Assistant model · ${option.label}` : option.label,
    checked: sameModel(option.model, chosen),
    ...(option.problem === null ? {} : { unavailable: { reason: words.problem(option.problem) } }),
    onSelect: () => onModel(option.model),
  }));
}

/**
 * The chip's value: the alias by name, kept even after it is removed (flow-assistant 5.2), or the
 * Assistant model's id once it is read.
 */
function modelLabel(model: ChatModel, choices: ChatChoices): string {
  if (model.kind === "alias") return model.name;
  return choices.models.find((option) => option.model.kind === "assistant")?.label ?? "";
}

/** Whether two chat models are the same: the Assistant model, or one alias by name. */
export function sameModel(a: ChatModel, b: ChatModel): boolean {
  if (a.kind === "alias" && b.kind === "alias") return a.name === b.name;
  return a.kind === b.kind;
}

/** A 28px ghost chip: the label in `fg-muted`, the value in `fg` weight 500, then ▾. */
function Chip({
  trigger,
  label,
  value,
}: {
  readonly trigger: MenuTriggerProps;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <Button {...trigger} variant="ghost" size="sm">
      <span className="text-small text-fg-muted">{label}</span>{" "}
      <span className="text-small font-medium text-fg">{value}</span>
      <span className="ml-0.5 inline-flex size-3.5 text-fg-subtle">
        <ChevronDownIcon />
      </span>
    </Button>
  );
}
