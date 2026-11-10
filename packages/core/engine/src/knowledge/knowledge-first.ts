// `mode: auto` knowledge: before the first model call, the task text is
// searched and the best passages go into the prompt. Every title and
// snippet goes through `knowledgeHitForModel` first, so text a source didn't
// promise is the workspace's own reaches the model only inside the
// untrusted fence (requirement `ports.untrusted-knowledge`).

import { knowledgeHitForModel } from "@halonicjs/app";
import type { ChatMessage, KnowledgeHit, KnowledgeProvider } from "@halonicjs/ports";
import type { TurnLog } from "../agent/turn-log.ts";

/** The most passages one `auto` source puts into the prompt. */
export const autoPassages = 3;

/** What {@link withKnowledgeFirst} needs. */
export interface KnowledgeFirstInput {
  /** The agent's sources with `mode: auto`. */
  readonly sources: readonly KnowledgeProvider[];
  /** The conversation so far; its last message from the user is the task text. */
  readonly messages: readonly ChatMessage[];
  /** The agent the search is for; it names the agent in the events. */
  readonly agent: string;
  readonly log?: TurnLog;
}

/**
 * The messages with the best passages of each `auto` source added to the
 * last user message (requirement `engine.knowledge-auto`). It searches each
 * source that can search for that message's text, logs `knowledge.searched`
 * with the refs it found, and adds at most {@link autoPassages} hits per
 * source. The messages stay as they are when nothing is found, there is no
 * user message or its text is blank.
 *
 * @throws when a source's search fails, or the log can't be written
 *
 * @example
 * const messages = await withKnowledgeFirst({ sources: [handbook], messages: [task], agent: "writer" });
 * // messages[0].content: the task, then "Passages from the knowledge source "handbook" …"
 */
export async function withKnowledgeFirst(input: KnowledgeFirstInput): Promise<ChatMessage[]> {
  const messages = [...input.messages];
  const last = messages.findLastIndex((message) => message.role === "user");
  const task = messages[last];
  const query = task?.content.trim() ?? "";
  if (task === undefined || query === "") {
    return messages;
  }
  const blocks: string[] = [];
  for (const source of input.sources) {
    if (!source.capabilities.search) {
      continue;
    }
    const hits = (await source.search(query, { limit: autoPassages })).slice(0, autoPassages);
    await input.log?.append({
      type: "knowledge.searched",
      agent: input.agent,
      source: source.id,
      query,
      refs: hits.map((hit) => hit.ref),
    });
    if (hits.length > 0) {
      blocks.push(passagesBlock(source, hits));
    }
  }
  if (blocks.length > 0) {
    messages[last] = { role: "user", content: [task.content, ...blocks].join("\n\n") };
  }
  return messages;
}

/** One source's passages, fenced as `knowledgeHitForModel` says. */
function passagesBlock(source: KnowledgeProvider, hits: readonly KnowledgeHit[]): string {
  const passages = hits.map((hit) => passageText(knowledgeHitForModel(source, hit)));
  return [
    `Passages from the knowledge source ${JSON.stringify(source.id)} that match the task best:`,
    ...passages,
  ].join("\n\n");
}

/**
 * One passage as text. The ref isn't fenced, because the model may read the
 * document with it, but it is quoted, so a ref with a line break can't start
 * a line of its own.
 */
function passageText(hit: KnowledgeHit): string {
  return `ref: ${JSON.stringify(hit.ref)}\ntitle: ${hit.title}\n${hit.snippet}`;
}
