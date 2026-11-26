import {
  TauriDefinitionStore,
  type TauriFileShell,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import {
  type ChatAnswer,
  type ChatAnswerRequest,
  reviewServiceKey,
  type ServiceRegistry,
} from "@halonicjs/app";
import type { ChatSessions, HttpClient } from "@halonicjs/ports";
import { AssistantHostService } from "@halonicjs/studio-feature-assistant/api";
import { ModelKeysService } from "@halonicjs/studio-feature-models/api";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import type { ShellEngine } from "@halonicjs/studio-shell";
import { answerChatOn } from "../engine/answer-chat-on.ts";
import { type AuthoringTurnParts, authoringChatExecutor } from "../engine/authoring-chat-turn.ts";
import type { WorkspaceTrust } from "../studio/workspace-trust.ts";
import type { RequestLogs } from "./chat-request-log.ts";
import { WorkspaceAssistant } from "./workspace-assistant.ts";

/** What the open folder's Assistant is built from. */
export interface AssistantHostParts {
  readonly files: TauriFileShell;
  readonly location: string;
  readonly trust: Pick<WorkspaceTrust, "isTrusted" | "subscribe">;
  /** Answers on the workspace's engine, as the Try it chat does. */
  readonly answerChat: (request: ChatAnswerRequest) => Promise<ChatAnswer>;
  /**
   * What a Build chat on the Settings › Assistant model calls its model with while the workspace
   * isn't trusted: in the page, on no engine, whichever engine the window uses (HAL-17335).
   */
  readonly authoring: Omit<AuthoringTurnParts, "localOnly">;
  /** The window's engine connection, which says whether the engine answers. */
  readonly engine?: Pick<ShellEngine, "on" | "connection"> | undefined;
  /** The workspace's name, as the window shows it. */
  readonly name: string;
  /** Where the workspace's chats are saved: the profile on the desktop, memory in the demo. */
  readonly chatSessions: ChatSessions;
  /** Opens the window's trust check for a message it refused. */
  readonly askTrust?: (() => Promise<"trusted" | "declined">) | undefined;
  /**
   * The shell's client for public addresses only, which a trusted Build chat's `read_docs` reads
   * docs with (`studio.assistant-read-docs`). Absent: the chat has no `read_docs`.
   */
  readonly docsHttp?: HttpClient | undefined;
  /**
   * The workspace's local request logs, which a trusted Build chat about a local integration reads
   * with `read_request_log` (`assistant.build.read-request-log`). Absent: no chat has the tool.
   */
  readonly requestLogs?: RequestLogs | undefined;
}

/**
 * Gives the open folder its Assistant (`studio.workspace-assistant`): chats answered on the
 * workspace's engine, whose tools read the saved files and write changes to review.
 */
export function provideAssistantHost(services: ServiceRegistry, parts: AssistantHostParts): void {
  const { engine } = parts;
  services.provide(
    AssistantHostService,
    new WorkspaceAssistant({
      files: new TauriDefinitionStore(parts.files, parts.location),
      review: services.get(reviewServiceKey),
      digest: webCryptoDigest,
      isTrusted: () => parts.trust.isTrusted(),
      answerChat: parts.answerChat,
      answerAuthoring: (request, localOnly) =>
        answerChatOn(async () => authoringChatExecutor({ ...parts.authoring, localOnly }))(request),
      onTrustChange: (listener) => parts.trust.subscribe(listener),
      settings: services.get(HostSettingsService),
      // Only whether a key is stored, never the key. A name the keychain refuses (one of
      // Halonic's own) can't hold the provider's key, so the menu says it needs one.
      hasKey: (secretName) =>
        services
          .get(ModelKeysService)
          .stored(secretName)
          .catch(() => false),
      engine:
        engine === undefined
          ? undefined
          : {
              answering: () => engine.connection === "connected",
              onChange: (listener) =>
                engine.on("engine.connection", (event) => listener(event.state === "connected")),
            },
      workspaceName: parts.name,
      chats: { sessions: parts.chatSessions, location: parts.location },
      askTrust: parts.askTrust,
      docs: parts.docsHttp === undefined ? undefined : { http: parts.docsHttp },
      requestLogs: parts.requestLogs,
    }),
  );
}
