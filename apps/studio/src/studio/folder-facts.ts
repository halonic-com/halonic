import { InboxService, waitingCount } from "@halonicjs/studio-feature-inbox/api";
import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import {
  type ChangesRead,
  ChangesSourceService,
} from "@halonicjs/studio-feature-source-control/api";
import type {
  FolderFacts,
  FolderFactsSource,
  FolderGitState,
  ServiceKey,
  ServiceTarget,
} from "@halonicjs/studio-shell";

/** How the rail names each answer the open folder's history gives. */
const gitStates: Readonly<Record<ChangesRead["kind"], FolderGitState>> = {
  ready: "repository",
  "not-a-repository": "not-a-repository",
  "no-git": "no-git-program",
  "nested-repository": "inside-a-larger-repository",
};

/** The services a folder's facts come from; each may be missing, as in a browser. */
interface FactServices {
  readonly changes: ChangesSourceLike | undefined;
  readonly runs: SubscribableState<{ readonly runs: readonly unknown[] }> | undefined;
  readonly inbox:
    | SubscribableState<{ readonly items: Parameters<typeof waitingCount>[0] }>
    | undefined;
}

interface ChangesSourceLike {
  readonly read: () => Promise<ChangesRead>;
  readonly subscribe: (listener: () => void) => () => void;
}

interface SubscribableState<State> {
  readonly state: State;
  subscribe(listener: () => void): () => void;
}

/**
 * The open folder's facts for the icon rail (`studio.folder-facts`), read from the folder's own
 * services: its history for the git state, the Runs list for recorded runs, the Inbox for what
 * waits. Studio opens workspace projects only for now, so the kind is a workspace project with
 * items; spotting a code folder inside comes with the Code entry's page (P5).
 */
export class FolderFactsFromServices implements FolderFactsSource {
  readonly #services: FactServices;
  readonly #onError: (error: unknown) => void;
  readonly #listeners = new Set<() => void>();
  #git: FolderGitState = "repository";
  #facts: FolderFacts;
  #stop: (() => void) | undefined;

  constructor(services: FactServices, onError: (error: unknown) => void) {
    this.#services = services;
    this.#onError = onError;
    this.#facts = this.#read();
  }

  /** The facts now: the same object until one of them changes. */
  get facts(): FolderFacts {
    return this.#facts;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    if (this.#stop === undefined) this.#start();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) {
        this.#stop?.();
        this.#stop = undefined;
      }
    };
  }

  #start(): void {
    const { changes, runs, inbox } = this.#services;
    const stops = [
      changes?.subscribe(() => void this.#readGit()),
      runs?.subscribe(() => this.#changed()),
      inbox?.subscribe(() => this.#changed()),
    ];
    this.#stop = () => {
      for (const stop of stops) stop?.();
    };
    void this.#readGit();
  }

  async #readGit(): Promise<void> {
    const changes = this.#services.changes;
    if (changes === undefined) return;
    try {
      this.#git = gitStates[(await changes.read()).kind];
      this.#changed();
    } catch (error) {
      // Git answering with an error leaves the last state; the Changes page shows the error itself.
      this.#onError(error);
    }
  }

  #changed(): void {
    const next = this.#read();
    if (sameFacts(next, this.#facts)) return;
    this.#facts = next;
    for (const listener of [...this.#listeners]) listener();
  }

  #read(): FolderFacts {
    const { runs, inbox } = this.#services;
    return {
      kind: "workspace-project",
      hasItems: true,
      hasCodeFolderInside: false,
      git: this.#git,
      runsRecorded: (runs?.state.runs.length ?? 0) > 0,
      waitingCount: inbox === undefined ? 0 : waitingCount(inbox.state.items),
    };
  }
}

/** The facts of a folder whose services are built: `shell.services.instantiate(services)` ran. */
export function folderFactsOf(
  services: ServiceTarget,
  onError: (error: unknown) => void,
): FolderFactsSource {
  return new FolderFactsFromServices(
    {
      changes: find(services, ChangesSourceService),
      runs: find(services, RunsListService),
      inbox: find(services, InboxService),
    },
    onError,
  );
}

/** A service the folder may not have, as Inbox in a browser without one. */
function find<Service>(services: ServiceTarget, key: ServiceKey<Service>): Service | undefined {
  return services.has(key) ? services.get(key) : undefined;
}

function sameFacts(left: FolderFacts, right: FolderFacts): boolean {
  return (Object.keys(left) as (keyof FolderFacts)[]).every((key) => left[key] === right[key]);
}
