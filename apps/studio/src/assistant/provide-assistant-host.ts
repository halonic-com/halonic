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
import { AssistantHostService } from "@halonicjs/studio-feature-assistant/api";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import type { ShellEngine } from "@halonicjs/studio-shell";
import type { WorkspaceTrust } from "../studio/workspace-trust.ts";
import { WorkspaceAssistant } from "./workspace-assistant.ts";

/** What the open folder's Assistant is built from. */
export interface AssistantHostParts {
  readonly files: TauriFileShell;
  readonly location: string;
  readonly trust: Pick<WorkspaceTrust, "isTrusted">;
  /** Answers on the workspace's engine, as the Try it chat does. */
  readonly answerChat: (request: ChatAnswerRequest) => Promise<ChatAnswer>;
  /** The window's engine connection, which says when the engine stopped answering. */
  readonly engine?: Pick<ShellEngine, "on"> | undefined;
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
      settings: services.get(HostSettingsService),
      onEngineStopped:
        engine === undefined
          ? undefined
          : (listener) =>
              engine.on("engine.connection", (event) => {
                if (event.state !== "connected") listener();
              }),
    }),
  );
}
