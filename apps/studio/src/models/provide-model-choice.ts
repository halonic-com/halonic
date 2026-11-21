import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { readOllamaTags } from "@halonicjs/adapter-http-kit";
import { workspaceProvider } from "@halonicjs/adapter-workspace-models";
import {
  detectLocalModels,
  ollamaDownloadedModelSource,
  type ServiceRegistry,
  workspaceFilesKey,
} from "@halonicjs/app";
import { ModelChoiceHostService } from "@halonicjs/studio-feature-first-run/api";
import { type ModelKeys, ModelsFilesService } from "@halonicjs/studio-feature-models/api";
import { ShellHttpClient, shellKeychain, type TauriIpc } from "@halonicjs/studio-services";
import type { WorkspaceTrust } from "../studio/workspace-trust.ts";
import { FirstRunModelChoice } from "./first-run-model-choice.ts";
import { workspaceSavedKeys } from "./first-run-test-secrets.ts";

/** What the first run's model choice needs from the open folder's services. */
export interface ModelChoiceParts {
  readonly ipc: TauriIpc;
  readonly trust: WorkspaceTrust;
  readonly keys: ModelKeys;
  /** Saves the workspace's waiting edits; `undefined` where nothing saves them. */
  readonly settle: (() => Promise<void>) | undefined;
}

/** Gives the first run's model choice: its test call goes the way a run's calls go. */
export function provideModelChoice(services: ServiceRegistry, parts: ModelChoiceParts): void {
  const { ipc, trust, keys, settle } = parts;
  const http = new ShellHttpClient(ipc);
  services.provide(
    ModelChoiceHostService,
    new FirstRunModelChoice({
      files: services.get(ModelsFilesService),
      change: (label, changes) => {
        const files = services.get(workspaceFilesKey);
        files.change(label, changes);
        const step = files.step;
        // Only while it is still the newest step: an undo would otherwise take back someone's edit.
        return () => {
          if (files.step === step) files.undo();
        };
      },
      settle,
      keys,
      // A saved key is read only for its own test, under the name rule a run reads keys by.
      saved: workspaceSavedKeys(shellKeychain(ipc)),
      trust,
      digest: webCryptoDigest,
      // The test call goes the way a run's calls go, with only the one key it tests as its secrets.
      provider: (file, secrets) => workspaceProvider(file, { secrets, http }),
      setTimer: (callback, delayMs) => {
        const timer = setTimeout(callback, delayMs);
        return () => clearTimeout(timer);
      },
      newTestId: () => crypto.randomUUID(),
      localModels: () => detectLocalModels(ollamaDownloadedModelSource(() => readOllamaTags(http))),
    }),
  );
}
