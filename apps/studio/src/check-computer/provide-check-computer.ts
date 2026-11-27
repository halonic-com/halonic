import { AgentHostDoctor, type AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { doctorWorkspace } from "@halonicjs/adapter-doctor-node/workspace";
import { TauriDefinitionStore, type TauriFileShell } from "@halonicjs/adapter-fs-tauri";
import type { ServiceRegistry } from "@halonicjs/app";
import { CheckComputerSourceService } from "@halonicjs/studio-feature-check-computer/api";
import { SampleWorkspaceService } from "@halonicjs/studio-feature-first-run/api";
import { GoogleSetupAccountsService } from "@halonicjs/studio-feature-google-setup/api";
import { ModelKeysService } from "@halonicjs/studio-feature-models/api";
import { RunsSourceService } from "@halonicjs/studio-feature-runs/api";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";
import { loadWorkspace } from "@halonicjs/workspace";
import type { LateEngine } from "../engine/late-engine.ts";
import { halonicVersion } from "../studio/open-trusts.ts";
import { aboutHalonic } from "../studio/start-watch.ts";
import { googleSetupFacts } from "./google-setups.ts";
import { lastFailedRun } from "./last-failed-run.ts";
import { WorkspaceCheckSource } from "./workspace-check-source.ts";

/** What {@link provideCheckComputer} reads: the folder, its files, the agent host and the engine. */
export interface CheckComputerParts {
  readonly files: TauriFileShell;
  readonly location: string;
  /** The workspace's name as the window shows it, for a `workspace.yaml` without one. */
  readonly name: string;
  readonly platform: KeyboardPlatform;
  /** The agent host, which runs the checks that need Node; `undefined` outside the desktop shell. */
  readonly transport: AgentHostTransport | undefined;
  /** The engine that runs the folder: the background engine, once the shell answered, when it runs one. */
  readonly engine: Pick<LateEngine, "background">;
}

/**
 * Gives the open folder Check this computer's facts (`CheckComputerSourceService`). It reads the
 * services provided before it: the demo, the keys, the runs and the Google setups. The models are
 * read as `halonic doctor` reads them (`doctorWorkspace`), from the saved files, so the dialog and
 * the CLI agree on which providers the aliases use.
 */
export function provideCheckComputer(services: ServiceRegistry, parts: CheckComputerParts): void {
  const { files, location, name, transport, engine } = parts;
  const workspace = () => loadWorkspace(new TauriDefinitionStore(files, location));
  const sample = services.get(SampleWorkspaceService);
  const keys = services.get(ModelKeysService);
  const runs = services.get(RunsSourceService);
  const google = services.get(GoogleSetupAccountsService);
  services.provide(
    CheckComputerSourceService,
    new WorkspaceCheckSource({
      about: aboutHalonic(halonicVersion, parts.platform),
      isDemo: () => sample.isSample(),
      // Without a background engine the page runs its own, which is there while the window is.
      engineAnswers: async () => (await engine.background())?.answers() ?? true,
      hostDoctor:
        transport === undefined ? undefined : () => new AgentHostDoctor(transport).doctor(location),
      readModels: async () => {
        const read = doctorWorkspace({
          workspace: await workspace(),
          integrations: [],
          location,
          fallbackName: name,
          commandPaths: new Map(),
          connectorFiles: new Map(),
        });
        return {
          aliases: read.aliases,
          providers: read.providers,
          localOnly: read.localOnly === true,
        };
      },
      keyStored: (secret) => keys.stored(secret),
      lastFailedRun: async () => lastFailedRun(runs, await workspace()),
      googleSetups: async () => googleSetupFacts(await google.list()),
      // Test again records its tests with its own pull request (HAL-13411, PR 5).
      tests: () => [],
    }),
  );
}
