// The plugin conformance suite's own checks (ADR 2026-11-09-plugins): the
// manifest, the SDK and the files it names. A plugin's backend is an
// integration, so the suite then runs every integration check on it.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { backendSheet, type Plugin } from "@halonicjs/format";
import { pluginLoadProblems } from "@halonicjs/integration-kit";
import type { Integration } from "@halonicjs/ports";
import { fail } from "./failure.ts";
import { backendSources, readPluginFolder } from "./plugin-folder.ts";
import type { RecordingFile } from "./recording.ts";
import type { ConformanceSubject, ToolCase } from "./run.ts";

/** What the suite checks for one plugin: its folder and, if it has a backend, the backend's code. */
export interface PluginConformanceSubject {
  /** The plugin folder, with its `plugin.yaml` (or an `integration.yaml`). */
  readonly folder: string;
  /**
   * The backend's code, the `Integration` its `entry` exports. Required when
   * the manifest has a backend, and refused when it has none.
   */
  readonly backend?: Integration;
  /** The backend's recording files (`halonic.recording/1`), one per scenario. */
  readonly recordings?: readonly RecordingFile[];
  /** The backend tool calls to make, each answered from a recording. */
  readonly cases?: readonly ToolCase[];
  /** Setting values, such as the URL a `{ fromSetting }` host reads. */
  readonly settings?: Readonly<Record<string, unknown>>;
}

/**
 * The manifest passes its schema and its own checks, it is built for this
 * Halonic's SDK, every file it names is in the folder, and the backend's
 * code matches its backend: name, version, and each tool's text,
 * arguments, `risk` and `untrusted`.
 */
export function checkPluginManifest(subject: PluginConformanceSubject): void {
  const { plugin } = readPluginFolder(subject.folder);
  checkBackendCodeGiven(plugin, subject.backend);
  const problems = pluginLoadProblems(plugin, subject.backend);
  if (problems.length > 0) {
    fail(problems.map(({ message, path }) => `${message} (at ${path.join(".")})`).join("\n"));
  }
  for (const path of namedFiles(plugin)) {
    if (!existsSync(join(subject.folder, path)))
      fail(`${path} is named in the manifest but isn't in the plugin folder`);
  }
}

/**
 * The plugin's backend as an integration subject: the backend's code, the
 * sheet `backendSheet` builds from the manifest, the subject's recordings
 * and cases, and every code file beside the backend's `entry` to scan.
 */
export function pluginBackendSubject(subject: PluginConformanceSubject): ConformanceSubject {
  const { plugin } = readPluginFolder(subject.folder);
  checkBackendCodeGiven(plugin, subject.backend);
  const sheet = backendSheet(plugin);
  if (sheet === undefined || plugin.backend === undefined || subject.backend === undefined)
    fail("the manifest has no backend to check");
  return {
    integration: subject.backend,
    sheet,
    recordings: subject.recordings ?? [],
    cases: subject.cases ?? [],
    ...(subject.settings === undefined ? {} : { settings: subject.settings }),
    sources: backendSources(subject.folder, plugin.backend.entry),
  };
}

/** Code for a backend the manifest doesn't declare is a load problem, reported by `pluginLoadProblems`. */
function checkBackendCodeGiven(plugin: Plugin, backend: Integration | undefined): void {
  if (plugin.backend !== undefined && backend === undefined)
    fail("the manifest declares a backend; pass the code its entry exports as `backend`");
}

/** The files in the plugin folder the manifest points at: the backend's entry and each local tool's script. */
function namedFiles(plugin: Plugin): string[] {
  const scripts = (plugin.localTools ?? []).flatMap((localTool) =>
    localTool.start.script === undefined ? [] : [localTool.start.script.path],
  );
  return plugin.backend === undefined ? scripts : [plugin.backend.entry, ...scripts];
}
