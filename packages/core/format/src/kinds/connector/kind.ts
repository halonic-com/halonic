import type { Path } from "@halonicjs/schema-kit";
import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { checkSecretName, looksLikeKey } from "../../shared/secret-name.ts";
import { Connector } from "./schema.ts";

/** `library/connectors/<id>.connector.yaml`, shared at the root or a hub's own. */
export const connectorKind: FileKind<Connector> = {
  name: "connector",
  about: "Tools for agents from an MCP server or a built-in service such as Google.",
  syntax: "yaml",
  schema: Connector,
  places: [
    { scope: "workspace-and-hub", folder: "library/connectors", name: "<id>.connector.yaml" },
  ],
  idFromPlace: "fallback",
  check: (connector) => [...checkSecretNames(connector), ...checkApprovedTools(connector)],
};

/**
 * Every value the connector gives as a secret's name: its own `secret`
 * (the HTTP bearer token or the Google refresh token) and, for a local
 * program, each `secretEnv` value.
 */
function secretNames(connector: Connector): Array<readonly [string, Path]> {
  const names: Array<readonly [string, Path]> = [];
  if (connector.secret !== undefined) {
    names.push([connector.secret, ["secret"]]);
  }
  if ("stdio" in connector.transport) {
    for (const [variable, name] of Object.entries(connector.transport.stdio.secretEnv ?? {})) {
      names.push([name, ["transport", "stdio", "secretEnv", variable]]);
    }
  }
  return names;
}

/** The secrets are named in the file, so a bad name or a pasted key is caught here, not at run time. */
function checkSecretNames(connector: Connector): KindCheckProblem[] {
  const problems = secretNames(connector).flatMap(
    ([name, path]) => checkSecretName(name, path) ?? [],
  );
  const clientProblem = checkGoogleClient(connector);
  return clientProblem === undefined ? problems : [...problems, clientProblem];
}

/**
 * A Google connector's `client` names no secret: the OAuth client's ID and
 * secret come from the account's Google setup (`google-setup.store-names`).
 * Only a pasted key is refused, since the file may be committed or shared.
 */
function checkGoogleClient(connector: Connector): KindCheckProblem | undefined {
  if (!("google" in connector.transport) || !looksLikeKey(connector.transport.google.client)) {
    return undefined;
  }
  return checkSecretName(connector.transport.google.client, ["transport", "google", "client"]);
}

/** A tool that needs approval but isn't in `tools.allow` is never offered, so say so. */
function checkApprovedTools(connector: Connector): KindCheckProblem[] {
  const { allow, approve } = connector.tools;
  const problems: KindCheckProblem[] = [];
  if (allow === undefined) {
    return problems;
  }
  approve.forEach((tool, index) => {
    if (allow.includes(tool)) {
      return;
    }
    problems.push({
      severity: "warning",
      code: "approved-tool-not-allowed",
      path: ["tools", "approve", index],
      message: `Connector "${connector.id}": "${tool}" needs approval but is not in tools.allow, so agents never see it`,
    });
  });
  return problems;
}
