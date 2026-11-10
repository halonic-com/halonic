import type { Path } from "@halonicjs/schema-kit";
import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { checkKeysIn } from "../../shared/key-in-value.ts";
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
  check: (connector) => [
    ...checkSecretNames(connector),
    ...checkPastedKeys(connector),
    ...checkApprovedTools(connector),
  ],
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

/**
 * HTTP headers and a local program's `env` and `args` take any text, so a
 * key pasted there would be saved in the file. The connector's `secret` and
 * `secretEnv` name the secrets instead.
 */
function checkPastedKeys(connector: Connector): KindCheckProblem[] {
  const { transport } = connector;
  if ("http" in transport) {
    return checkKeysIn(transport.http.headers, ["transport", "http", "headers"], "header");
  }
  if ("stdio" in transport) {
    const path: Path = ["transport", "stdio"];
    return [
      ...checkKeysIn(transport.stdio.env, [...path, "env"], "env"),
      ...transport.stdio.args.flatMap((arg, index) => {
        const [name, value] = argument(arg, transport.stdio.args[index - 1]);
        return checkKeysIn(value, [...path, "args", index], "arg", name);
      }),
    ];
  }
  return [];
}

/**
 * An argument's value and the option it belongs to: `--api-key=…` and
 * `--api-key …` both name the value, so a key without a known format is
 * still caught after a flag that says it is one.
 *
 * @example
 * argument("--token=abc", undefined); // ["--token", "abc"]
 * argument("abc", "--token"); // ["--token", "abc"]
 */
function argument(arg: string, before: string | undefined): readonly [string | undefined, string] {
  const equals = arg.indexOf("=");
  if (arg.startsWith("-") && equals > 0) {
    return [arg.slice(0, equals), arg.slice(equals + 1)];
  }
  return [before?.startsWith("-") ? before : undefined, arg];
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
