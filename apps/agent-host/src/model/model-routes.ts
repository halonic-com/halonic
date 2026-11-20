import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import {
  type ChatResponse,
  type HttpClient,
  isModelCallError,
  type LlmProviderFactory,
  type Secrets,
  type TrustStore,
} from "@halonicjs/ports";
import { filesOf, isOnThisMachine, loadWorkspace } from "@halonicjs/workspace";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { namedWorkspace } from "../server/named-workspace.ts";
import { OpenLimit } from "../server/open-limit.ts";
import {
  chatRequestOf,
  type ModelChatBody,
  maxMessageChars,
  messageChars,
  modelChatBody,
} from "./model-schemas.ts";
import { isProviderTrusted } from "./provider-trust.ts";

/** What the model route reaches. */
export interface ModelRouteDeps {
  /** The folders the launcher named as workspaces (the `--sweep-root`s, without Halonic's profile folder). */
  workspaceRoots: readonly string[];
  /** The factories by provider type. A provider of another type isn't called. */
  factories: readonly LlmProviderFactory[];
  /** Where a provider's key is read from, by the secret name its file gives. The page never sends one. */
  secrets: Secrets;
  /**
   * The trust records of the user's profile, which the host reads itself
   * before it calls a provider; `undefined` without a profile folder, so
   * only the test model is called.
   */
  trustStore: TrustStore | undefined;
  /**
   * The client the providers call through. It must reach this machine only:
   * {@link isOnThisMachine} reads the address in the file, and this is the
   * second check, on the address the name really resolves to.
   */
  http: HttpClient;
  /** How many chats run at once; another gets 429. Default {@link defaultMaxChats}. */
  maxChats?: number;
  /** Where the host writes what it keeps from a failure; the answer never carries it. */
  log?: (text: string) => void;
}

/** How many chats the route runs at once: the Studio window asks for one at a time, and a model on this computer is slow. */
export const defaultMaxChats = 2;

const tooManyChatsMessage =
  "The agent host is already running the most chats it allows. Try again in a moment.";

const modelFailedMessage =
  "The model couldn't finish this request. The agent host's log has the detail.";

/**
 * One chat call on a workspace provider that runs on this machine, for the
 * Studio window, which can't call a model itself (its content security policy
 * allows no other address):
 *
 * - `POST /v1/models/chat` with `{ workspaceRoot, provider, request }` answers
 *   the provider's `ChatResponse`.
 *
 * The host trusts nothing of the window's but the question. It loads the
 * workspace from the folder itself and takes the provider's address and key
 * from that, then refuses a provider that doesn't pass {@link isOnThisMachine}
 * (403 `provider_not_on_this_machine`), so the route can't send workspace text
 * to a remote service. Studio checks the workspace's trust before it asks;
 * the host checks it again on the provider it loaded (403
 * `workspace_not_trusted`, see {@link isProviderTrusted}), so a provider file
 * saved in between isn't called. The request is capped (see `model-schemas.ts`). Other
 * answers: 403 `workspace_not_named` for a folder the launcher didn't name,
 * 404 `unknown_provider`, 400 `provider_type_unsupported`, 413 `request_too_large`,
 * 429 `too_many_chats` while `maxChats` chats are already running.
 *
 * The model call stops when the window drops its connection, so a chat nobody
 * waits for doesn't keep the model busy.
 *
 * A call the provider fails answers 502 `model_failed`. A provider's own
 * error (`ModelCallError`) says why and never holds a key, so its text goes
 * through; any other error's text can hold paths, so only the host's log has it.
 */
export function modelRoutes(deps: ModelRouteDeps): HostRoute[] {
  const limit = new OpenLimit(deps.maxChats ?? defaultMaxChats, () => 0);
  return [
    {
      method: "POST",
      path: "/v1/models/chat",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, modelChatBody);
        if (body === undefined) return;
        if (messageChars(body.request) > maxMessageChars) {
          sendError(
            response,
            413,
            "request_too_large",
            `The messages are longer than ${maxMessageChars} characters.`,
          );
          return;
        }
        const release = limit.reserve();
        if (release === undefined) {
          sendError(response, 429, "too_many_chats", tooManyChatsMessage);
          return;
        }
        const dropped = new AbortController();
        const onDropped = () => {
          if (!response.writableFinished) dropped.abort();
        };
        response.on("close", onDropped);
        try {
          const answer = await chat(deps, body, response, dropped.signal);
          if (answer !== undefined) sendJson(response, 200, answer);
        } catch (error) {
          // Nobody is left to answer when the window dropped the connection.
          if (!dropped.signal.aborted) failed(deps, response, error);
        } finally {
          response.off("close", onDropped);
          release();
        }
      },
    },
  ];
}

/** The provider's answer, or `undefined` after the route refused. */
async function chat(
  deps: ModelRouteDeps,
  body: ModelChatBody,
  response: Parameters<typeof sendError>[0],
  signal: AbortSignal,
): Promise<ChatResponse | undefined> {
  const root = await namedWorkspace(deps.workspaceRoots, body.workspaceRoot);
  if (root === undefined) {
    sendError(
      response,
      403,
      "workspace_not_named",
      "The workspace folder isn't one the agent host was given.",
    );
    return undefined;
  }
  const workspace = await loadWorkspace(new FolderDefinitionStore(root, root));
  const file = filesOf(workspace, "provider").find((each) => each.value.id === body.provider);
  if (file === undefined) {
    sendError(response, 404, "unknown_provider", "This workspace has no provider with that id.");
    return undefined;
  }
  const provider = file.value;
  if (!isOnThisMachine(provider)) {
    sendError(
      response,
      403,
      "provider_not_on_this_machine",
      "This provider doesn't run on this computer, so the agent host doesn't call it for the window.",
    );
    return undefined;
  }
  const factory = deps.factories.find((each) => each.type === provider.type);
  if (factory === undefined) {
    sendError(
      response,
      400,
      "provider_type_unsupported",
      `The agent host has no model adapter for providers of type ${provider.type}.`,
    );
    return undefined;
  }
  if (!(await isProviderTrusted(deps.trustStore, root, provider))) {
    sendError(
      response,
      403,
      "workspace_not_trusted",
      "This computer's trust record doesn't cover this provider in this workspace. Trust the workspace first.",
    );
    return undefined;
  }
  const model = factory.create(
    {
      id: provider.id,
      type: provider.type,
      local: provider.local,
      options: provider.options,
      ...(provider.baseUrl === undefined ? {} : { baseUrl: provider.baseUrl }),
      ...(provider.secret === undefined ? {} : { secret: provider.secret }),
    },
    { secrets: deps.secrets, http: deps.http },
  );
  return await model.chat({ ...chatRequestOf(body.request), signal });
}

/** Answers 502 `model_failed`, and keeps the detail of an error that isn't a provider's own in the host's log. */
function failed(
  deps: ModelRouteDeps,
  response: Parameters<typeof sendError>[0],
  error: unknown,
): void {
  if (isModelCallError(error)) {
    sendError(response, 502, "model_failed", error.message);
    return;
  }
  const name = error instanceof Error ? error.name : "Error";
  const detail = error instanceof Error ? error.message : String(error);
  deps.log?.(`A model request failed (${name}): ${detail}\n`);
  sendError(response, 502, "model_failed", modelFailedMessage);
}
