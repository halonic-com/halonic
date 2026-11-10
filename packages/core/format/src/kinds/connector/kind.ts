import type { Path } from "@halonicjs/schema-kit";
import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { checkSecretName } from "../../shared/secret-name.ts";
import { Connector, googleClientSecretNames } from "./schema.ts";

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
 * A Google connector's `client` isn't a secret's name itself, but every name
 * it forms is one. Each formed name is checked, and the first problem is
 * reported once, at `client`: the names share the `client` part, so one bad
 * `client` would otherwise give the same problem twice. The longest name
 * also catches a `client` that fits 128 characters only on its own.
 */
function checkGoogleClient(connector: Connector): KindCheckProblem | undefined {
  if (!("google" in connector.transport)) {
    return undefined;
  }
  const path: Path = ["transport", "google", "client"];
  for (const name of googleClientSecretNames(connector.transport.google.client)) {
    const problem = checkSecretName(name, path);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
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
