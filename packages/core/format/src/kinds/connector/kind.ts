import type { Path } from "@halonicjs/schema-kit";
import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { checkKeysIn } from "../../shared/key-in-value.ts";
import { checkSecretName, looksLikeKey } from "../../shared/secret-name.ts";
import { approveAll, Connector } from "./schema.ts";

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
    ...checkGoogleValues(connector),
    ...checkPastedKeys(connector),
    ...checkApprovedTools(connector),
  ],
};

/**
 * Every value the connector gives as a secret's name: its own `secret` (the
 * HTTP bearer token) and, for a local program, each `secretEnv` value. A
 * Google connector names no secret: see {@link checkGoogleValues}.
 */
function secretNames(connector: Connector): Array<readonly [string, Path]> {
  const names: Array<readonly [string, Path]> = [];
  if (connector.secret !== undefined && !("google" in connector.transport)) {
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
  return secretNames(connector).flatMap(([name, path]) => checkSecretName(name, path) ?? []);
}

/**
 * A Google connector's `client` and `secret` name no secret. The account's
 * Google setup decides which OAuth client a sign-in uses and keeps the
 * refresh token as `google-account-<accountRef>` (`google-setup.store-names`).
 * Both stay so older files still read, and both are refused only when they
 * hold a pasted key, since the file may be committed or shared.
 */
function checkGoogleValues(connector: Connector): KindCheckProblem[] {
  if (!("google" in connector.transport)) {
    return [];
  }
  const values: Array<readonly [string | undefined, Path]> = [
    [connector.transport.google.client, ["transport", "google", "client"]],
    [connector.secret, ["secret"]],
  ];
  return values.flatMap(([value, path]) =>
    value !== undefined && looksLikeKey(value) ? (checkSecretName(value, path) ?? []) : [],
  );
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

/**
 * A tool that needs approval but isn't in `tools.allow` is never offered, so
 * say so. `approve: all` names no tool, so there is nothing to compare.
 */
function checkApprovedTools(connector: Connector): KindCheckProblem[] {
  const { allow, approve } = connector.tools;
  const problems: KindCheckProblem[] = [];
  if (allow === undefined || approve === approveAll) {
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
