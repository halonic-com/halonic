import {
  type AgentHostAnswer,
  AgentHostError,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import { AgentHostNotAnswering } from "./agent-host-not-answering.ts";

/** One screenshot feedback to send, as the Send feedback window makes it. */
export interface FeedbackToSend {
  /** The workspace's real path, and the Paperclip connection whose key the host holds. */
  readonly workspace: string;
  readonly connection: string;
  /** The feedback's own ID: sending it again makes no second task. */
  readonly id: string;
  /** At most 80 characters; the host refuses a longer one. */
  readonly title: string;
  readonly description: string;
  /** The project and the agent by name, as Settings › Feedback keeps them. */
  readonly project: string;
  readonly assignee: string;
  /** The crop as a PNG file, or `null` for a feedback without a screenshot. */
  readonly screenshot: { readonly fileName: string; readonly png: Uint8Array } | null;
}

/** What sending one feedback came to; never Paperclip's words. */
export type FeedbackSent =
  | { readonly outcome: "sent"; readonly taskUrl: string }
  | { readonly outcome: "offline" | "not-connected" | "refused" };

const route = "POST /v1/paperclip/feedback";

/**
 * Sends screenshot feedback through the agent host (`services.feedback-send`,
 * HAL-18969), which holds the Paperclip key, so the page never sees one.
 *
 * Besides the host's own answer, a host that isn't answering is `offline`, so
 * the feedback waits to be sent again; a body the host refused (too large,
 * not valid) is `refused`, as sending it again can't work; and a workspace
 * the host doesn't serve is `not-connected`.
 */
export class AgentHostFeedback {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /**
   * Sends `feedback`.
   *
   * @throws {@link AgentHostError} when the host answers anything else: no launch token, a fault, or an answer of another shape
   */
  async send(feedback: FeedbackToSend): Promise<FeedbackSent> {
    let answer: AgentHostAnswer;
    try {
      answer = await this.#transport.request(route, bodyOf(feedback));
    } catch (error) {
      if (error instanceof AgentHostNotAnswering) return { outcome: "offline" };
      throw error;
    }
    return sentOf(answer);
  }
}

/** The route's body: the screenshot's bytes as base64, which JSON can carry. */
function bodyOf(feedback: FeedbackToSend): object {
  const { screenshot, ...words } = feedback;
  if (screenshot === null) return words;
  const { fileName, png } = screenshot;
  return { ...words, screenshot: { fileName, contentType: "image/png", base64: base64Of(png) } };
}

/** The outcome the host's answer stands for. */
function sentOf(answer: AgentHostAnswer): FeedbackSent {
  if (answer.status === 413 || answer.status === 400) return { outcome: "refused" };
  if (answer.status === 404) return { outcome: "not-connected" };
  if (answer.status !== 200) return hostError(answer);
  const body = answer.body;
  if (typeof body !== "object" || body === null) return invalid();
  const { outcome, taskUrl } = body as Record<string, unknown>;
  if (outcome === "sent") {
    return typeof taskUrl === "string" ? { outcome, taskUrl } : invalid();
  }
  if (outcome === "offline" || outcome === "not-connected" || outcome === "refused") {
    return { outcome };
  }
  return invalid();
}

function hostError(answer: AgentHostAnswer): never {
  throw new AgentHostError(
    answer.status,
    "send_failed",
    `The agent host answered ${route} with ${answer.status}.`,
  );
}

function invalid(): never {
  throw new AgentHostError(
    200,
    "answer_invalid",
    `The agent host's answer to ${route} isn't what Halonic expects.`,
  );
}

/** `bytes` as base64, a slice at a time, so a large screenshot doesn't overflow the call stack. */
function base64Of(bytes: Uint8Array): string {
  const slice = 0x8000;
  let binary = "";
  for (let start = 0; start < bytes.length; start += slice) {
    binary += String.fromCharCode(...bytes.subarray(start, start + slice));
  }
  return btoa(binary);
}
