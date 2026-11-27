import { TauriDefinitionStore, TauriRecordStore } from "@halonicjs/adapter-fs-tauri";
import type { ServiceRegistry } from "@halonicjs/app";
import { EngineAutoOpen, engineAutoOpenKey } from "../engine/engine-auto-open.ts";
import { engineServiceKey } from "../engine/engine-service.ts";
import type { LateEngine } from "../engine/late-engine.ts";
import type { FolderServiceParts } from "./provide-folder-services.ts";
import { isFocusedAppWindow } from "./window-label.ts";

/**
 * Opens the page's own `engine` as soon as the folder needs it for its routines or run timers
 * (`studio.engine-service`), and asks again when the trust changes or a save lands. Provide it
 * after the engine, so the registry stops it asking before the engine closes. It first waits for
 * the shell's answer: with a background engine, or in a focused app's window, it does nothing.
 */
export function provideEngineAutoOpen(
  services: ServiceRegistry,
  {
    ipc,
    files,
    trust,
    location,
    scope,
    engine: late,
    window,
  }: Pick<FolderServiceParts, "ipc" | "files" | "trust" | "location" | "scope" | "window"> & {
    readonly engine: LateEngine;
  },
): void {
  // Only Studio's window opens it for them: the engine lock is held per window, so Halonic Inbox
  // opening it would refuse Studio's window the same workspace's engine (studio.focused-app-window).
  if (isFocusedAppWindow(window)) return;
  const engine = services.get(engineServiceKey);
  // A background engine runs the routines itself, so only the page's own engine opens for them.
  const ownEngine = late.background().then((remote) => remote === undefined);
  const autoOpen = services.provide(
    engineAutoOpenKey,
    new EngineAutoOpen({
      open: async () => {
        // A run waiting for a timer resumes on an engine with the Local only just saved.
        await engine.reopenOnLocalOnlySave();
        return engine.open();
      },
      definitions: new TauriDefinitionStore(files, location),
      records: new TauriRecordStore(ipc, location),
      // Waits here for the shell's answer: a folder closed meanwhile is caught right after it.
      mayStart: async (workspace) => (await ownEngine) && trust.mayStart(workspace),
      onChange: (listener) => {
        const stops = [trust.subscribe(listener), scope.events.on("files.saved", listener)];
        return () => {
          for (const stop of stops) stop();
        };
      },
      reportError: (error) => console.error("The engine didn't open for the routines", error),
    }),
  );
  void ownEngine.then((own) => (own ? autoOpen.check() : autoOpen.dispose()));
}
