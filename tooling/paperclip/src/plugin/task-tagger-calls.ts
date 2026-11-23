import { costUsd, type Usage } from "../task-tagger/spend.ts";
import {
  parseVerdict,
  taggerMaxTokens,
  taggerModel,
  taggerPrompt,
  taskMessage,
  type Verdict,
} from "../task-tagger/verdict.ts";
import { errorCode } from "./board-check-api.ts";

/**
 * The tagger's two outside requests: the Haiku call and the lookup of the
 * company's label ids in Paperclip's API. Both take a key the caller has just
 * resolved and drops afterwards; neither logs anything, and a failure comes
 * back as a short code, never as the answer's body.
 */

/** Anthropic's Messages API. A constant, so no setting can send the key elsewhere. */
const messagesUrl = "https://api.anthropic.com/v1/messages";

/** How long each request may take. */
const requestTimeoutMs = 15_000;

/** What a Haiku call came back with. */
export type HaikuResult =
  | { readonly ok: true; readonly verdict: Verdict | undefined; readonly usd: number }
  | { readonly ok: false; readonly reason: string; readonly usd: number };

/** The parts of a Messages API answer the tagger reads. */
interface MessagesAnswer {
  readonly content?: readonly { readonly type?: unknown; readonly text?: unknown }[];
  readonly usage?: Usage;
}

function answerText(answer: MessagesAnswer): string {
  return (answer.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
}

/** Asks Haiku for a task's verdict. `verdict` is undefined when the answer isn't the JSON asked for. */
export async function askHaiku(
  fetch: typeof globalThis.fetch,
  anthropicKey: string,
  task: { readonly title: string; readonly description: string | null },
): Promise<HaikuResult> {
  try {
    const response = await fetch(messagesUrl, {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: taggerModel,
        max_tokens: taggerMaxTokens,
        // Haiku 5.5 thinks by default; the board's tagger runs without it.
        thinking: { type: "disabled" },
        system: taggerPrompt,
        messages: [{ role: "user", content: taskMessage(task.title, task.description) }],
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}`, usd: 0 };
    }
    const answer = (await response.json()) as MessagesAnswer;
    return { ok: true, verdict: parseVerdict(answerText(answer)), usd: costUsd(answer.usage) };
  } catch (error) {
    return { ok: false, reason: errorCode(error), usd: 0 };
  }
}

/** The company's labels by name, or a short failure code. */
export async function companyLabels(
  fetch: typeof globalThis.fetch,
  api: { readonly url: string; readonly key: string },
  companyId: string,
): Promise<ReadonlyMap<string, string> | string> {
  try {
    const response = await fetch(
      `${api.url}/api/companies/${encodeURIComponent(companyId)}/labels`,
      {
        headers: { authorization: `Bearer ${api.key}` },
        signal: AbortSignal.timeout(requestTimeoutMs),
      },
    );
    if (!response.ok) {
      return `http_${response.status}`;
    }
    const labels = (await response.json()) as readonly { name?: unknown; id?: unknown }[];
    const byName = new Map<string, string>();
    for (const label of Array.isArray(labels) ? labels : []) {
      if (typeof label.name === "string" && typeof label.id === "string") {
        byName.set(label.name, label.id);
      }
    }
    return byName;
  } catch (error) {
    return errorCode(error);
  }
}
