import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RunEvent, RunEventBody } from "@halonicjs/events";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { nodeProfileEnvironment, openWorkspaceRuns } from "../workspace-runs.ts";

/**
 * A folder for the `halonic runs` tests: Acme's workspace with its Support
 * reply workflow in `acme`, and a profile folder of its own, which holds the
 * runs the tests store.
 */
export interface AcmeRuns {
  /** The temporary folder that holds both; {@link removeAcmeRuns} deletes it. */
  readonly folder: string;
  /** Acme's workspace folder. */
  readonly acme: string;
  /** Points `HALONIC_HOME` at the test's own profile folder. */
  readonly profile: ProfileEnvironment;
}

/** Noon on 10 Nov 2026 in UTC, so runs from this morning read as today's time. */
export const now = new Date(Date.UTC(2026, 10, 10, 12, 0));

/** Acme's support hub: Support reply, with a step to draft and one to approve. */
export const supportReply = [
  "id: support-reply",
  "name: Support reply",
  "initial: draft",
  "states:",
  "  draft:",
  "    description: Draft a reply",
  "    type: final",
  "  review:",
  "    description: Approve this reply?",
  "    type: final",
  "",
].join("\n");

/** Makes a new {@link AcmeRuns} folder, named after the tests that use it. */
export async function makeAcmeRuns(name: string): Promise<AcmeRuns> {
  const folder = await mkdtemp(join(tmpdir(), `halonic-cli-${name}-`));
  const acme = join(folder, "acme");
  await mkdir(join(folder, "profile"));
  await writeFiles(acme, {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/workflows/support-reply.workflow.yaml": supportReply,
  });
  const profile = {
    ...nodeProfileEnvironment(),
    variables: { HALONIC_HOME: join(folder, "profile") },
  };
  return { folder, acme, profile };
}

export async function removeAcmeRuns(runs: AcmeRuns): Promise<void> {
  await rm(runs.folder, { recursive: true, force: true });
}

/** Writes each file, by its path under `root`, making the folders it needs. */
export async function writeFiles(
  root: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

/** Today at `time` ("10:31:18"), in UTC. */
export function today(time: string): string {
  return `2026-11-10T${time}.000Z`;
}

/** One run of Acme's Support reply, as a test stores it. */
export interface StoredRun {
  readonly id: string;
  readonly start: string;
  /** The events after `run.started`, each with its time. */
  readonly after?: readonly (readonly [string, RunEventBody])[];
  readonly kind?: "run" | "test";
  readonly workflowId?: string;
}

/** Stores runs of Acme's Support reply in the profile folder, as `halonic run` would. */
export async function storeRuns(acmeRuns: AcmeRuns, ...runs: readonly StoredRun[]): Promise<void> {
  const store = await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile);
  for (const run of runs) {
    const bodies: (readonly [string, RunEventBody])[] = [
      [
        run.start,
        {
          type: "run.started",
          hubId: "support",
          workflowId: run.workflowId ?? "support-reply",
          input: {},
          kind: run.kind ?? "run",
          definitionsVersion: "v1",
        },
      ],
      ...(run.after ?? []),
    ];
    const events = bodies.map(
      ([at, body], index) => ({ ...body, runId: run.id, seq: index + 1, at }) as RunEvent,
    );
    const result = await store.append(run.id, 0, events);
    if (!result.ok) {
      throw new Error(`The test couldn't store the run ${run.id}.`);
    }
  }
}

/** A run in its first step since 10:53. */
export const running: StoredRun = {
  id: "run_mfx3k2a1_09d9c0",
  start: today("10:53:00"),
  after: [[today("10:53:01"), { type: "state.entered", state: "draft" }]],
};

/** A run waiting since 10:41 for the user to approve or reject. */
export const waiting: StoredRun = {
  id: "run_mfx3k2a1_09d9a0",
  start: today("10:40:00"),
  after: [
    [today("10:40:30"), { type: "state.entered", state: "review" }],
    [today("10:41:00"), { type: "run.waiting", state: "review", events: ["approve", "reject"] }],
  ],
};

/** A run that finished at 10:31:18, in 18 s. */
export const done: StoredRun = {
  id: "run_mfx3k2a1_a1b2c3",
  start: today("10:31:00"),
  after: [
    [today("10:31:01"), { type: "state.entered", state: "draft" }],
    [today("10:31:18"), { type: "run.completed", state: "draft", context: {} }],
  ],
};
