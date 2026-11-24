import type { RunMetadata } from "@halonicjs/adapter-cloudflare-storage";
import type { RuntimeExportManifest } from "@halonicjs/format/runtime-export";
import { type Principal, type Scope, scopeName } from "@halonicjs/host-server";
import { buildManifest, type ExportSource } from "./export-data.ts";

/** Who asks for a scope's export: the deployment's operator, with the admin key, or a principal. */
export type ExportViewer = { readonly operator: true } | { readonly principal: Principal };

/** The actor an operator's export names: the admin key has no end user behind it. */
export const operatorActor = "operator";

/** The stores a scope's export reads: an export's, with the run list's metadata. */
export interface ScopeExportSource extends ExportSource {
  readonly runs: ExportSource["runs"] & { metadata(): Promise<RunMetadata[]> };
}

/**
 * A scope's export and what Cloud records of it: who asked (an id, never a name) and the kind.
 * `full` carries every file of the scope; `metadata` carries the run list's rows and no content.
 */
export type ScopeExport =
  | { readonly kind: "full"; readonly actor: string; readonly manifest: RuntimeExportManifest }
  | { readonly kind: "metadata"; readonly actor: string; readonly runs: RunMetadata[] };

/** Thrown when the viewer may not export the scope at all. It names no data of the scope. */
export class ExportRefusedError extends Error {
  override readonly name = "ExportRefusedError";

  constructor() {
    super("This export is only for the scope's owner, an organisation's admin or the operator.");
  }
}

/**
 * What the viewer may export of the scope. The operator and the scope's owner get all of it; an
 * organisation's admin gets the runs' metadata only, because private runs' content goes to an
 * owner alone (design 13.7); a member, or a principal of another scope, gets nothing.
 *
 * @throws ExportRefusedError when the viewer may export nothing of the scope
 */
export function exportKindFor(scope: Scope, viewer: ExportViewer): ScopeExport["kind"] {
  if ("operator" in viewer) return "full";
  const { principal } = viewer;
  if (scopeName(principal.scope) !== scopeName(scope)) throw new ExportRefusedError();
  if (principal.role === "owner") return "full";
  if (principal.role === "admin") return "metadata";
  throw new ExportRefusedError();
}

/**
 * Exports one scope for a viewer. The source must be the scope's own runtime; this decides only
 * how much of it the viewer gets, so no route can hand an admin a private run's content.
 *
 * @param deployment - the deployment's id, written into a full export's manifest
 * @param now - the time of the export
 * @throws ExportRefusedError when the viewer may export nothing of the scope
 * @throws ExportSecretError when a full export finds something shaped like a secret
 */
export async function exportScope(
  source: ScopeExportSource,
  scope: Scope,
  viewer: ExportViewer,
  deployment: string,
  now: Date,
): Promise<ScopeExport> {
  const kind = exportKindFor(scope, viewer);
  const actor = "operator" in viewer ? operatorActor : viewer.principal.actor;
  if (kind === "metadata") {
    return { kind, actor, runs: await source.runs.metadata() };
  }
  return { kind, actor, manifest: await buildManifest(source, deployment, now) };
}
