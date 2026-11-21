import { TauriDefinitionStore, type TauriFileShell } from "@halonicjs/adapter-fs-tauri";
import { type ServiceRegistry, type WorkspaceScope, workspaceFilesKey } from "@halonicjs/app";
import { FilesHostService } from "@halonicjs/studio-feature-files/api";
import { FilesWithErrorsService, type KeyboardPlatform } from "@halonicjs/studio-shell";
import { WorkspaceFilesWithErrors } from "./files-with-errors.ts";
import { WorkspaceFilesHost } from "./workspace-files-host.ts";

/** What the Files services need from the open folder and the shell. */
export interface FilesServiceParts {
  readonly files: TauriFileShell;
  readonly location: string;
  readonly scope: WorkspaceScope;
  readonly platform: KeyboardPlatform;
}

/**
 * Gives the Files feature the workspace's files (`studio.workspace-files-host`), and every
 * feature the files with errors (`studio.files-with-errors`). Both check the files again after
 * each change and each save.
 */
export function provideFilesServices(
  services: ServiceRegistry,
  { files, location, scope, platform }: FilesServiceParts,
): void {
  const onChangeOrSave = (listener: () => void) => {
    const stops = [
      scope.events.on("files.changed", listener),
      scope.events.on("files.saved", listener),
    ];
    return () => {
      for (const stop of stops) stop();
    };
  };
  services.provide(
    FilesHostService,
    new WorkspaceFilesHost({
      store: new TauriDefinitionStore(files, location),
      files: services.get(workspaceFilesKey),
      onChange: onChangeOrSave,
      platform,
    }),
  );
  services.provide(
    FilesWithErrorsService,
    new WorkspaceFilesWithErrors({
      files: services.get(workspaceFilesKey),
      onChange: onChangeOrSave,
    }),
  );
}
