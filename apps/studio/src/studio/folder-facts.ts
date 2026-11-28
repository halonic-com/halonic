import { InboxService, waitingCount } from "@halonicjs/studio-feature-inbox/api";
import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import { ChangesListService, type ChangesRead } from "@halonicjs/studio-feature-source-control/api";
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

/** A service whose state the facts read, and that says when it may have changed. */
interface Watched<State> {
  readonly state: State;
  subscribe(listener: () => void): () => void;
}

/** The services a folder's facts come from; each may be missing, as the Inbox in a browser. */
interface FactServices {
  /** The Changes list, which reads the folder's history for the Changes page too. */
  readonly changes: Watched<{ readonly read: ChangesRead | undefined }> | undefined;
  readonly runs: Watched<{ readonly runs: readonly unknown[] }> | undefined;
  readonly inbox: Watched<{ readonly items: Parameters<typeof waitingCount>[0] }> | undefined;
}

/**
 * The open folder's facts for the icon rail (`studio.folder-facts`), read from the folder's own
 * services: the Changes list for the git state, the Runs list for recorded runs, the Inbox for
 * what waits. They read git and runs themselves, so the facts add no work of their own. Studio
 * opens workspace projects only for now, so the kind is a workspace project with items; spotting
 * a code folder inside comes with the Code entry's page (P5).
 */
export class FolderFactsFromServices implements FolderFactsSource {
  readonly #services: FactServices;
  readonly #listeners = new Set<() => void>();
  #git: FolderGitState = "repository";
  #facts: FolderFacts;
  #stop: (() => void) | undefined;

  constructor(services: FactServices) {
    this.#services = services;
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
    const changed = () => this.#changed();
    const stops = [
      changes?.subscribe(changed),
      runs?.subscribe(changed),
      inbox?.subscribe(changed),
    ];
    this.#stop = () => {
      for (const stop of stops) stop?.();
    };
    // What changed before the first listener came, such as a run starting, shows at once.
    this.#changed();
  }

  #changed(): void {
    const next = this.#read();
    if (sameFacts(next, this.#facts)) return;
    this.#facts = next;
    for (const listener of [...this.#listeners]) listener();
  }

  #read(): FolderFacts {
    const { changes, runs, inbox } = this.#services;
    // Until the history's first answer, and while it can't be read, the last state stays.
    const read = changes?.state.read;
    if (read !== undefined) this.#git = gitStates[read.kind];
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
export function folderFactsOf(services: ServiceTarget): FolderFactsSource {
  return new FolderFactsFromServices({
    changes: find(services, ChangesListService),
    runs: find(services, RunsListService),
    inbox: find(services, InboxService),
  });
}

/** A service the folder may not have, as the Inbox in a browser without one. */
function find<Service>(services: ServiceTarget, key: ServiceKey<Service>): Service | undefined {
  return services.has(key) ? services.get(key) : undefined;
}

function sameFacts(left: FolderFacts, right: FolderFacts): boolean {
  return (Object.keys(left) as (keyof FolderFacts)[]).every((key) => left[key] === right[key]);
}
