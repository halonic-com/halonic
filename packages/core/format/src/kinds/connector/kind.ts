import { passesNameRule } from "@halonicjs/ports";
import type { Path } from "@halonicjs/schema-kit";
import { isSecretVariableName } from "@halonicjs/std";
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
    ...checkInheritedNames(connector),
    ...checkApprovedTools(connector),
    ...checkReadTools(connector),
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

/** A variable name a program can be given: letters, digits and `_`, not starting with a digit. */
const variableName = /^[A-Za-z_][A-Za-z0-9_]*$/;

/*
 * The words are the team's (HAL-6266), next to the placeholders of
 * `secret-name.ts` and `key-in-value.ts` that wait on the board.
 */
const inheritWords = {
  "inherit-env-name": (name: string) =>
    `"${name}" isn't a variable name. Use only letters, digits and _, not starting with a digit.`,
  "inherit-env-secret": (name: string) =>
    `"${name}" looks like it holds a secret, so it can't be taken from your environment. Store the value as a secret and set this variable under secretEnv to the secret's name instead.`,
  "inherit-env-duplicate": (name: string) =>
    `"${name}" is already in this list. Name each variable once, whatever its letter case.`,
} as const;

/**
 * `inheritEnv` names variables a local program takes from the app's own
 * environment. A name that says it holds a secret, such as
 * `ANTHROPIC_API_KEY`, is refused: a workspace file must not reach for a
 * key in the person's shell, and `secretEnv` names the secret openly. A name
 * written twice, in any letter case, is refused too, since Windows reads
 * `Aws_Profile` and `AWS_PROFILE` as one variable.
 */
function checkInheritedNames(connector: Connector): KindCheckProblem[] {
  if (!("stdio" in connector.transport)) {
    return [];
  }
  const problems: KindCheckProblem[] = [];
  const seen = new Set<string>();
  (connector.transport.stdio.inheritEnv ?? []).forEach((name, index) => {
    const path: Path = ["transport", "stdio", "inheritEnv", index];
    const folded = name.toUpperCase();
    const repeated = seen.has(folded);
    seen.add(folded);
    if (!variableName.test(name)) {
      const code = "inherit-env-name";
      problems.push({ severity: "error", code, path, message: inheritWords[code](name) });
    } else if (isSecretVariableName(name)) {
      const code = "inherit-env-secret";
      problems.push({ severity: "error", code, path, message: inheritWords[code](name) });
    } else if (repeated) {
      const code = "inherit-env-duplicate";
      problems.push({ severity: "error", code, path, message: inheritWords[code](name) });
    }
  });
  return problems;
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

/** Characters that make a name in `tools.read` look like a pattern, not a tool's name. */
const patternCharacters = /[*?[\]{}]/;

/**
 * Said when a name in `tools.read` fails the listed-tool name rule. It
 * doesn't quote the name: the character at fault may be invisible, so the
 * name would look right. Wording: Sofia, HAL-5762.
 */
const readNameBreaksRule = `"read" needs exact tool names: letters a–z and A–Z, digits 0–9, "_" and "-", up to 64 characters. This one doesn't match, often because of a space, a look-alike letter or an invisible character.`;

/**
 * `tools.read` takes exact names only, so a pattern is refused rather than
 * matching nothing in silence. A name must also pass the name rule that a
 * server's tool names pass, so a look-alike letter, a space or an invisible
 * character can't make a name read as one tool and be another; it is
 * refused too. A name that `tools.allow` leaves out is never offered, so
 * say so. Without `tools.allow` nothing checks the names against a listing:
 * a name, exactly as written, makes a tool `read` as soon as a server lists
 * a tool by that name. Wording: Sofia, HAL-5582 and HAL-5762.
 */
function checkReadTools(connector: Connector): KindCheckProblem[] {
  const { allow, read } = connector.tools;
  const problems: KindCheckProblem[] = [];
  read?.forEach((tool, index) => {
    const path: Path = ["tools", "read", index];
    if (patternCharacters.test(tool)) {
      problems.push({
        severity: "error",
        code: "read-tool-pattern",
        path,
        message: `"read" needs exact tool names. "${tool}" looks like a pattern.`,
      });
    } else if (!passesNameRule(tool)) {
      problems.push({
        severity: "error",
        code: "read-tool-name",
        path,
        message: readNameBreaksRule,
      });
    } else if (allow !== undefined && !allow.includes(tool)) {
      problems.push({
        severity: "warning",
        code: "read-tool-not-allowed",
        path,
        message: `"read" lists "${tool}", but this connector has no tool by that name. Check the spelling.`,
      });
    }
  });
  return problems;
}
