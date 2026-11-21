import {
  type Connector,
  connectorIsLocalWith,
  type IntegrationHost,
  outsideHosts,
  type Provider,
  runsInRunner,
  sheetHostsOf,
} from "@halonicjs/format";
import type { WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";
import { isAliasName } from "./model-aliases.ts";
import { aliasFiles, modelSettings } from "./model-settings.ts";
import { runsInHarness } from "./working-folders.ts";

/** How every message ends: the two ways out. */
const turnOff = "or set privacy.localOnly: false in workspace.yaml";

/**
 * A workspace whose `workspace.yaml` sets `privacy.localOnly: true` keeps
 * everything on this computer (ADR `2026-11-08-local-first`). This reports
 * as an error each model alias, each `provider/model` setting and each
 * connector that would reach past it, and each agent that runs in a harness
 * program (Claude Code or Codex), because such a program sends the work to
 * its own cloud model. A provider is local when its file says `local: true`,
 * or when it is the mock model, as the engine counts it; a connector as
 * `connectorIsLocalWith` says, with the sheets' hosts the loader was given.
 * A provider no file has is left to the reference checks.
 */
export function checkLocalOnly(context: CheckContext): WorkspaceIssue[] {
  const workspace = context.filesOf("workspace")[0];
  if (workspace === undefined || !workspace.value.privacy.localOnly) {
    return [];
  }
  const providers = new Map(
    context.filesOf("provider", null).map((file) => [file.value.id, file.value]),
  );
  const cloud = (provider: string): boolean => {
    const file = providers.get(provider);
    return file !== undefined && !providerIsLocal(file);
  };
  return [
    ...aliasIssues(context, cloud),
    ...modelSettingIssues(context, cloud),
    ...connectorIssues(context),
    ...harnessIssues(context),
  ];
}

/** The model aliases whose provider isn't local. */
function aliasIssues(
  context: CheckContext,
  cloud: (provider: string) => boolean,
): WorkspaceIssue[] {
  return aliasFiles(context).flatMap(({ file, key, aliases }) =>
    Object.entries(aliases)
      .filter(([, target]) => cloud(target.provider))
      .map(([alias, target]) => {
        const message = `Alias "${alias}" uses provider "${target.provider}", which isn't local, and the workspace is local only: point it at a local provider, ${turnOff}`;
        return context.error(file, [key, alias, "provider"], "local-only-model", message);
      }),
  );
}

/** The `provider/model` settings whose provider isn't local; an alias is checked where it is defined. */
function modelSettingIssues(
  context: CheckContext,
  cloud: (provider: string) => boolean,
): WorkspaceIssue[] {
  return modelSettings(context).flatMap((setting) => {
    const provider = setting.model.slice(0, setting.model.indexOf("/"));
    if (isAliasName(setting.model) || !cloud(provider)) {
      return [];
    }
    const message = `${setting.owner} uses model "${setting.model}", whose provider "${provider}" isn't local, and the workspace is local only: use a local model, ${turnOff}`;
    return [context.error(setting.file, setting.path, "local-only-model", message)];
  });
}

/**
 * The connectors that aren't local, pointing at `local` when the file sets
 * it. Only a program or an address gets the `local: true` hint: a plugin's
 * or an integration's code goes where its sheet says, so the message names
 * the hosts that aren't local when the sheet lists any.
 */
function connectorIssues(context: CheckContext): WorkspaceIssue[] {
  return context
    .filesOf("connector")
    .filter((connector) => !connectorIsLocalWith(connector.value, context.sheetHosts))
    .map((connector) => {
      const path = connector.value.local === undefined ? ["transport"] : ["local"];
      const message = connectorMessage(connector.value, context);
      return context.error(connector.path, path, "local-only-connector", message);
    });
}

/** Why a connector isn't local, and the way out: `local: true` only for a program or an address. */
function connectorMessage(connector: Connector, context: CheckContext): string {
  if (!runsInRunner(connector)) {
    return `Connector "${connector.id}" isn't local, and the workspace is local only: set local: true if it runs on this computer, ${turnOff}`;
  }
  const { sheetHosts } = context;
  const hosts = sheetHosts === undefined ? [] : (sheetHostsOf(connector, sheetHosts) ?? []);
  const outside = outsideHosts(hosts);
  if (outside.length === 0) {
    return `Connector "${connector.id}" isn't local, and the workspace is local only: set privacy.localOnly: false in workspace.yaml to use it`;
  }
  return `${codeOf(connector)} reaches ${outside.map(shownHost).join(", ")}, so it isn't local: set privacy.localOnly: false in workspace.yaml to use it`;
}

/** Whose code a runner connector runs: "The plugin acme-orders" or "The integration in integrations/notes". */
function codeOf({ transport }: Connector): string {
  if ("plugin" in transport) return `The plugin ${transport.plugin.id}`;
  return "integration" in transport
    ? `The integration in integrations/${transport.integration.folder}`
    : "Its code";
}

/** A sheet's host as written, or the setting that holds it. */
function shownHost(host: IntegrationHost): string {
  return typeof host === "string" ? host : `the address in its ${host.fromSetting} setting`;
}

/** The agents that run in a harness program, which calls its own model, not the workspace's. */
function harnessIssues(context: CheckContext): WorkspaceIssue[] {
  return context
    .filesOf("agent")
    .filter(runsInHarness)
    .map((agent) => {
      const message = `Agent "${agent.value.id}" runs in ${agent.value.harness}, which sends its work to its own cloud model, and the workspace is local only: remove harness to run it in Halonic's own loop, ${turnOff}`;
      return context.error(agent.path, ["harness"], "local-only-harness", message);
    });
}

/** Whether a provider runs on this computer; the mock model always does. */
export function providerIsLocal(provider: Provider): boolean {
  return provider.local || provider.type === "mock";
}
