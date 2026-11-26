import type { SyncDiagnostics } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** Reads the engine's sync counts and timings (requirement `agent-host.sync-diagnostics`). */
export interface SyncDiagnosticsReader {
  /** The counts and timings of the last 24 hours, as they are now. */
  read(): Promise<SyncDiagnostics>;
}

/**
 * How Settings › Sync diagnostics reads the engine's sync counters. Only the desktop app, whose
 * agent host keeps them, provides it; without it the section never shows.
 */
export const SyncDiagnosticsService: ServiceKey<SyncDiagnosticsReader> =
  serviceKey<SyncDiagnosticsReader>("sync-diagnostics");
