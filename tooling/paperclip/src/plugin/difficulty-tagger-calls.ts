import { readAnswer, type TaggerAnswer } from "../difficulty-tagger/answer.ts";
import { taggerPrompt } from "../difficulty-tagger/prompt.ts";
import { errorCode } from "./board-check-api.ts";

/**
 * The difficulty tagger's two requests: the question to the model, and the
 * company's label ids from Paperclip's API. Each returns an error code
 * instead of throwing, and neither ever puts the key or task text in it.
 */

/** A `fetch` the caller picks: the host's guarded one for Anthropic, Node's own for Paperclip. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The one address the tagger sends task text to. */
export const anthropicMessagesUrl = "https://api.anthropic.com/v1/messages";

/** How long one request may take. */
const requestTimeoutMs = 20_000;

/** Enough for the answer's JSON (the board's recipe, HAL-16876). */
const maxTokens = 400;

/** The answer, or the reason there is none. */
export type Asked = { readonly answer: TaggerAnswer } | { readonly failure: string };

/** The model's text blocks, joined, or undefined when the response isn't a finished message. */
function answerText(body: unknown): { text: string } | { failure: string } {
  const message = body as { stop_reason?: unknown; content?: unknown } | null;
  if (message?.stop_reason === "refusal") {
    return { failure: "refusal" };
  }
  if (message?.stop_reason === "max_tokens") {
    return { failure: "max_tokens" };
  }
  const blocks = Array.isArray(message?.content) ? message.content : [];
  const text = blocks
    .filter((block): block is { type: "text"; text: string } => {
      const candidate = block as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string";
    })
    .map((block) => block.text)
    .join("");
  return { text };
}

/** Asks the model about one task's text with the board's prompt, thinking off. */
export async function askTagger(
  fetch: Fetch,
  key: string,
  model: string,
  input: string,
): Promise<Asked> {
  try {
    const response = await fetch(anthropicMessagesUrl, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        thinking: { type: "disabled" },
        system: taggerPrompt,
        messages: [{ role: "user", content: input }],
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      return { failure: `http_${response.status}` };
    }
    const read = answerText(await response.json());
    if ("failure" in read) {
      return read;
    }
    const answer = readAnswer(read.text);
    return answer === undefined ? { failure: "no_answer" } : { answer };
  } catch (error) {
    return { failure: errorCode(error) };
  }
}

/** The company's label ids by lower-case name, or the reason they couldn't be read. */
export async function companyLabelIds(
  fetch: Fetch,
  apiUrl: string,
  key: string,
  companyId: string,
): Promise<{ readonly ids: ReadonlyMap<string, string> } | { readonly failure: string }> {
  try {
    const response = await fetch(
      `${apiUrl}/api/companies/${encodeURIComponent(companyId)}/labels`,
      {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(requestTimeoutMs),
      },
    );
    if (!response.ok) {
      return { failure: `http_${response.status}` };
    }
    const labels: unknown = await response.json();
    const ids = new Map<string, string>();
    for (const label of Array.isArray(labels) ? labels : []) {
      const { id, name } = label as { id?: unknown; name?: unknown };
      if (typeof id === "string" && typeof name === "string") {
        ids.set(name.trim().toLowerCase(), id);
      }
    }
    return { ids };
  } catch (error) {
    return { failure: errorCode(error) };
  }
}
