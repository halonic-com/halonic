import { TauriDefinitionStore, TauriRecordStore } from "@halonicjs/adapter-fs-tauri";
import type { ServiceRegistry } from "@halonicjs/app";
import { EngineAutoOpen, engineAutoOpenKey } from "../engine/engine-auto-open.ts";
import { engineServiceKey } from "../engine/engine-service.ts";
import type { FolderServiceParts } from "./provide-folder-services.ts";

/**
 * Opens the page's own `engine` as soon as the folder needs it for its routines or run timers
 * (`studio.engine-service`), and asks again when the trust changes or a save lands. Provide it
 * after the engine, so the registry stops it asking before the engine closes. With a background
 * engine it does nothing.
 */
export function provideEngineAutoOpen(
  services: ServiceRegistry,
  {
    ipc,
    files,
    trust,
    location,
    scope,
    remoteEngine,
  }: Pick<FolderServiceParts, "ipc" | "files" | "trust" | "location" | "scope" | "remoteEngine">,
): void {
  // A background engine runs the routines itself, so only the page's own engine opens for them.
  if (remoteEngine !== undefined) return;
  const engine = services.get(engineServiceKey);
  const autoOpen = services.provide(
    engineAutoOpenKey,
    new EngineAutoOpen({
      open: () => engine.open(),
      definitions: new TauriDefinitionStore(files, location),
      records: new TauriRecordStore(ipc, location),
      mayStart: (workspace) => trust.mayStart(workspace),
      onChange: (listener) => {
        const stops = [trust.subscribe(listener), scope.events.on("files.saved", listener)];
        return () => {
          for (const stop of stops) stop();
        };
      },
      reportError: (error) => console.error("The engine didn't open for the routines", error),
    }),
  );
  void autoOpen.check();
}
