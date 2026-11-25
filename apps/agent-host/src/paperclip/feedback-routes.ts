import type { FeedbackSendOutcome, FeedbackTaskInput } from "@halonicjs/adapter-paperclip-client";
import type { PaperclipBinding } from "@halonicjs/host-agent-messaging-hub";
import { type Infer, s } from "@halonicjs/schema-kit";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { namedWorkspace } from "../server/named-workspace.ts";
import { paperclipConnectionNamePattern } from "./paperclip-key-routes.ts";

/**
 * The largest feedback body the host reads: the screenshot's PNG as base64,
 * and the task's words. Every other route keeps the host's 1 MiB.
 */
export const feedbackMaxBodyBytes = 10 * 1024 * 1024;

/** The eight bytes every PNG file starts with. */
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const feedbackBody = s
  .object({
    workspace: s.string().min(1).max(4096),
    connection: s.string().regex(paperclipConnectionNamePattern),
    /** The feedback's own ID, so a send repeated after a lost answer makes one task. */
    id: s.string().regex(/^[A-Za-z0-9_-]{1,128}$/u),
    title: s.string().min(1).max(80),
    description: s.string().max(20_000),
    /** The project and the agent by name, as Settings › Feedback keeps them. */
    project: s.string().min(1).max(256),
    assignee: s.string().min(1).max(256),
    screenshot: s
      .object({
        fileName: s.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\.png$/u),
        contentType: s.literal("image/png"),
        base64: s.string().regex(/^[A-Za-z0-9+/]+={0,2}$/u),
      })
      .strict()
      .optional(),
  })
  .strict();

type FeedbackBody = Infer<typeof feedbackBody>;

/** One connection's feedback sender, as `PaperclipFeedback` is. */
export interface FeedbackSender {
  send(id: string, task: FeedbackTaskInput, image: Uint8Array | null): Promise<FeedbackSendOutcome>;
}

/** What the feedback route reaches. */
export interface FeedbackRouteDeps {
  /** The workspace folders the launcher named. */
  workspaceRoots: readonly string[];
  /** The connection's sender, behind its key guard; `undefined` when the host holds no key for it. */
  senderFor: (binding: PaperclipBinding) => FeedbackSender | undefined;
  /** Where the host writes what failed; never a key and never Paperclip's words. */
  log: (text: string) => void;
}

/** The route's answer: one of four outcomes, and the task's page once it is sent. */
export type FeedbackAnswer =
  | { readonly outcome: "sent"; readonly taskUrl: string }
  | { readonly outcome: "offline" | "not-connected" | "refused" };

/**
 * The route Studio sends a screenshot feedback through
 * (`agent-host.feedback-send-route`, HAL-18969): the host holds the Paperclip
 * key, so the page never does.
 *
 * `POST /v1/paperclip/feedback` with `{ workspace, connection, id, title,
 * description, project, assignee, screenshot? }` runs `PaperclipFeedback`
 * with the key held for that workspace's connection, and answers
 * `{ outcome }`: `sent` (with `taskUrl`), `offline`, `not-connected` or
 * `refused`. It never answers Paperclip's words, nor logs them.
 *
 * It refuses, sending nothing: a body over {@link feedbackMaxBodyBytes}
 * (413 `body_too_large`, before it is read), a body that doesn't fit or a
 * screenshot that isn't a PNG (400 `body_invalid`), and a folder that isn't
 * the real path of a workspace the launcher named (404 `unknown_workspace`).
 * The launch token is checked before any route, as for every `/v1` route.
 *
 * It sits under `/v1/paperclip/` because it uses the key the hand-over kept:
 * on Windows, the shell sends that prefix to the messaging-only host, which
 * holds the keys (`agent-host.messaging-only`).
 */
export function feedbackRoutes(deps: FeedbackRouteDeps): HostRoute[] {
  return [
    {
      method: "POST",
      path: "/v1/paperclip/feedback",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, feedbackBody, {
          maxBytes: feedbackMaxBodyBytes,
        });
        if (body === undefined) return;
        const image = body.screenshot === undefined ? null : pngBytes(body.screenshot.base64);
        if (image === undefined) {
          sendError(response, 400, "body_invalid", "The screenshot is not a PNG.");
          return;
        }
        const workspace = await namedWorkspace(deps.workspaceRoots, body.workspace);
        if (workspace === undefined) {
          sendError(response, 404, "unknown_workspace", "The host serves no such workspace.");
          return;
        }
        const sender = deps.senderFor({ workspace, connection: body.connection });
        const answer: FeedbackAnswer =
          sender === undefined
            ? { outcome: "not-connected" }
            : answerOf(await send(sender, body, image, deps.log));
        sendJson(response, 200, answer);
      },
    },
  ];
}

/** Sends the feedback; a sender that throws (an answer it can't read) counts as refused. */
async function send(
  sender: FeedbackSender,
  body: FeedbackBody,
  image: Uint8Array | null,
  log: (text: string) => void,
): Promise<FeedbackSendOutcome | undefined> {
  const { title, description, project, assignee, screenshot } = body;
  const task: FeedbackTaskInput = {
    title,
    description,
    project,
    assignee,
    screenshot:
      screenshot === undefined
        ? null
        : { fileName: screenshot.fileName, contentType: screenshot.contentType },
  };
  try {
    return await sender.send(body.id, task, image);
  } catch (error) {
    // Only the error's name: its message may quote what Paperclip answered.
    log(`A feedback wasn't sent (${error instanceof Error ? error.name : "Error"}).\n`);
    return undefined;
  }
}

/** The outcome as the page reads it: a refusal's reason, Paperclip's words, stays in the host. */
function answerOf(outcome: FeedbackSendOutcome | undefined): FeedbackAnswer {
  if (outcome === undefined) return { outcome: "refused" };
  if (outcome.kind === "sent") return { outcome: "sent", taskUrl: outcome.taskUrl };
  return { outcome: outcome.kind };
}

/** The screenshot's bytes, or `undefined` when they aren't a PNG. */
function pngBytes(base64: string): Uint8Array | undefined {
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  const isPng = pngSignature.every((byte, index) => bytes[index] === byte);
  return isPng ? bytes : undefined;
}
