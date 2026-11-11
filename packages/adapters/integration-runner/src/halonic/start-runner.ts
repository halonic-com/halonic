// Starts one runner through a `Sandbox` session and connects to it (design
// HAL-958, sections 2 and 5). The runner gets its own session with the
// untrusted profile and a fresh nonce. The session lives exactly as long as
// the runner: when the runner stops for any reason, the session closes, and
// with it everything the runner started.
//
// Whether the runner may start at all, fenced or on the confirmed path without
// the fence, is decided before this is called (the start gate in `core/app`).
// This only reports the session's fence proof. A session whose proof is
// `not-fenced` refuses to start anything, so a fence that fails is never
// worked around here (A23).

import { randomUUID } from "node:crypto";
import type { Sandbox, SandboxFence } from "@halonicjs/ports";
import {
  type ConnectRunnerOptions,
  connectRunner,
  type RunnerConnection,
} from "./connect-runner.ts";
import { runnerCommand } from "./runner-command.ts";
import {
  isInsideOrSame,
  type RunnerFiles,
  type RunnerMachine,
  runnerProfile,
} from "./runner-profile.ts";

/** What {@link startRunner} needs. */
export interface StartRunnerOptions extends Omit<ConnectRunnerOptions, "process" | "nonce"> {
  /** The sandbox to start the runner in: `sandbox-srt`, or `sandbox-host` on the confirmed path without the fence. */
  sandbox: Sandbox;
  /** Where Node, the runner and the integration are. */
  files: RunnerFiles;
  /** The integration's module file inside its folder, and the name it exports the integration under. */
  entry: { file: string; exportName: string };
  /** The home folder, the socket folders, the temp folder and the time limit. */
  machine: RunnerMachine;
  /** Aborting it closes the session and so stops the runner. */
  signal?: AbortSignal;
}

/** A started runner. */
export interface StartedRunner extends RunnerConnection {
  /** The session's fence proof, read when the runner started. It is per start and never stored. */
  readonly fence: SandboxFence;
}

/**
 * Opens a session with the untrusted profile, starts the runner in it and
 * waits for its `ready`. Closing the connection, or the runner stopping by
 * itself, closes the session.
 *
 * @throws {RunnerStoppedError} when the runner stops before it is ready
 * @throws when a path the runner needs is, or holds, a folder the fence hides, or a folder on the way can't be listed; no session is opened
 * @throws when the sandbox can't open the session or start the runner, such as a fence proof that is `not-fenced`
 */
export async function startRunner(options: StartRunnerOptions): Promise<StartedRunner> {
  const { sandbox, files, entry, machine, signal, ...connect } = options;
  if (
    entry.file === files.integrationFolder ||
    !isInsideOrSame(entry.file, files.integrationFolder)
  ) {
    throw new Error("the integration's entry file is not inside its folder");
  }
  const nonce = randomUUID();
  const session = await sandbox.open(
    runnerProfile(files, machine),
    signal === undefined ? {} : { signal },
  );
  const stopReports = session.onBlocked((block) => connect.onBlocked?.({ kind: "fence", block }));
  const closeSession = async () => {
    stopReports();
    await session.close();
  };
  let connection: RunnerConnection;
  try {
    const process = await session.start(
      runnerCommand(files, { nonce, entryFile: entry.file, exportName: entry.exportName }),
    );
    connection = await connectRunner({ ...connect, process, nonce });
  } catch (error) {
    await closeSession();
    throw error;
  }
  const fence = session.fence;
  const sessionClosed = connection.stopped.then(closeSession);
  // `close()` still rethrows a failed session close; this only keeps it from
  // going unhandled when nobody calls `close()`.
  sessionClosed.catch(() => {});
  return {
    fence,
    stopped: connection.stopped,
    callTool: (name, args, callSignal) => connection.callTool(name, args, callSignal),
    close: async () => {
      await connection.close();
      await sessionClosed;
    },
  };
}
