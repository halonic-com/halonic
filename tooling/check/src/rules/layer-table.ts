import type { CheckContext } from "../lib/context.ts";
import type { Layer } from "../lib/layout.ts";
import type { WorkspacePackage } from "../lib/workspace.ts";

/**
 * The layer table as code: which package may depend on which.
 * The layers rule applies it to `package.json` dependencies and imports.
 */

/** Where an edge comes from: a runtime dependency, or dev-only (devDependencies, tests, config files). */
export type EdgeKind = "runtime" | "dev";

export function layerOf(context: CheckContext, pkg: WorkspacePackage): Layer | undefined {
  return context.placeOf(pkg)?.layer;
}

/** Explains why `from` may not use `to`, or returns `undefined` when it may. */
export function layerProblem(
  context: CheckContext,
  from: WorkspacePackage,
  to: WorkspacePackage,
  kind: EdgeKind,
): string | undefined {
  const fromLayer = layerOf(context, from);
  const toLayer = layerOf(context, to);
  if (fromLayer === undefined || toLayer === undefined || from === to) {
    return undefined;
  }
  if (toLayer === "testing" && fromLayer !== "testing" && kind === "runtime") {
    return "testing packages are never a runtime dependency. Move it to devDependencies.";
  }
  if (toLayer === "tooling" && fromLayer !== "tooling" && kind === "runtime") {
    return "tooling packages are dev-only. Move it to devDependencies.";
  }
  if (kind === "dev" && (toLayer === "testing" || toLayer === "tooling")) {
    return undefined;
  }
  return layerRule(context, fromLayer, toLayer, from, to);
}

function layerRule(
  context: CheckContext,
  fromLayer: Layer,
  toLayer: Layer,
  from: WorkspacePackage,
  to: WorkspacePackage,
): string | undefined {
  const fromName = from.manifest.name ?? from.directory;
  const toName = to.manifest.name ?? to.directory;
  switch (fromLayer) {
    case "apps":
    case "testing":
      return undefined;
    case "tooling":
      return toLayer === "tooling"
        ? undefined
        : "tooling packages use only other tooling packages.";
    case "core":
      return coreRule(context, toLayer, fromName, toName);
    case "adapters":
      return toLayer === "core" || toLayer === "adapters"
        ? undefined
        : "adapters may use core packages and other adapters' public interfaces only.";
    case "host":
      return toLayer === "core"
        ? undefined
        : "host packages are runtime-neutral and may use core packages only. A target wires in the adapters.";
    case "targets":
      return targetRule(context, toLayer, from, to);
    case "studio":
      return studioRule(context, toLayer, from, to);
  }
}

function coreRule(
  context: CheckContext,
  toLayer: Layer,
  fromName: string,
  toName: string,
): string | undefined {
  if (toLayer !== "core") {
    return "core packages may use only other core packages. Move this code into an adapter, or use a port.";
  }
  const order = context.policy.coreOrder;
  if (order.indexOf(toName) >= order.indexOf(fromName)) {
    return `core packages may use only core packages listed before them in "coreOrder" (${context.policyPath}). Reorder only if it keeps the list free of cycles.`;
  }
  return undefined;
}

function targetRule(
  context: CheckContext,
  toLayer: Layer,
  from: WorkspacePackage,
  to: WorkspacePackage,
): string | undefined {
  const kind = context.placeOf(from)?.target?.kind;
  if (toLayer === "core" || toLayer === "adapters") {
    return undefined;
  }
  if (kind === "runtime") {
    if (toLayer === "host") {
      return undefined;
    }
    return toLayer === "targets"
      ? "a target's runtime never uses a deploy package or another target's runtime."
      : "a target's runtime may use core, host and adapter packages only.";
  }
  const toTarget = context.placeOf(to)?.target;
  if (toTarget?.kind === "runtime" && toTarget.name === context.placeOf(from)?.target?.name) {
    return undefined;
  }
  return "a deploy package may use core packages, adapters and the runtime packages of its own target, whose bundles it ships.";
}

function studioRule(
  context: CheckContext,
  toLayer: Layer,
  from: WorkspacePackage,
  to: WorkspacePackage,
): string | undefined {
  if (toLayer === "core") {
    return undefined;
  }
  if (toLayer === "adapters") {
    const gateway = context.policy.adapterGateways.includes(from.manifest.name ?? "");
    return gateway ? undefined : "Studio packages reach adapters only through studio/services.";
  }
  if (toLayer !== "studio") {
    return "Studio packages may use core and other Studio packages only.";
  }
  const fromFeature = context.placeOf(from)?.isFeature === true;
  const toFeature = context.placeOf(to)?.isFeature === true;
  if (toFeature && !fromFeature) {
    return "shared Studio packages never depend on a feature; features plug in through the shell's contribution points.";
  }
  return undefined;
}
