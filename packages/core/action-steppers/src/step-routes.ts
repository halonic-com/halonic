import type { ActionBodyField, ActionCallRoute, ActionRoute } from "@halonicjs/ports";
import { assert } from "@halonicjs/std";
import type { CallBodyField, Step, StepperDefinition } from "./stepper-types.ts";
import { type ParameterField, parameterFieldsOf } from "./strict-parameters.ts";

type Fields = Readonly<Record<string, ParameterField>>;

const placeholder = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/** Escapes a choice so it matches itself and nothing else inside a pattern. */
const literal = (text: string) => text.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");

/**
 * The pattern the shell checks a value with. The route list holds a pattern
 * without flags, so a text parameter that a route uses may not use `i`: the
 * shell would refuse values the page took. A text pattern goes in as it is
 * written, since the shell reads no groups (`action-send`'s `pattern.rs`);
 * only one with a `|` is wrapped, so `^a|b$` can't match more than the whole
 * value in a JavaScript check.
 */
function patternOf(name: string, field: ParameterField): string {
  switch (field.kind) {
    case "text": {
      assert(
        !field.pattern.flags.includes("i"),
        `parameter ${name}: a pattern a route uses can't have the i flag`,
      );
      const source = field.pattern.source;
      return source.includes("|") ? `^(?:${source.slice(1, -1)})$` : source;
    }
    case "choice":
      return `^(?:${field.options.map(literal).join("|")})$`;
    case "integer":
      return field.min < 0 ? "^-?[0-9]{1,16}$" : "^[0-9]{1,16}$";
  }
}

function fieldOf(fields: Fields, name: string, where: string): ParameterField {
  const field = Object.hasOwn(fields, name) ? fields[name] : undefined;
  assert(field !== undefined, `${where}: {${name}} isn't a parameter`);
  return field;
}

/** Each `{name}` in a template and its pattern. A placeholder always fills a segment, so its parameter can't be optional. */
function placeholdersOf(template: string, fields: Fields, where: string): Record<string, string> {
  const placeholders: Record<string, string> = {};
  for (const [, name = ""] of template.matchAll(placeholder)) {
    const field = fieldOf(fields, name, where);
    assert(field.optional !== true, `${where}: {${name}} can't be an optional parameter`);
    placeholders[name] = patternOf(name, field);
  }
  return placeholders;
}

function bodyFieldOf(field: CallBodyField, fields: Fields, where: string): ActionBodyField {
  if (field.kind === "constant") return { name: field.name, kind: "constant", value: field.value };
  const parameter = fieldOf(fields, field.name, where);
  if (parameter.kind === "integer") return { name: field.name, kind: "integer" };
  return { name: field.name, kind: "string", pattern: patternOf(field.name, parameter) };
}

function routeOf(
  definition: StepperDefinition,
  step: Step,
  number: number,
  fields: Fields,
): ActionRoute | undefined {
  const where = `${definition.id}@${definition.version} step ${number}`;
  const base = { definition: definition.id, version: definition.version, step: number };
  const service = definition.service;
  switch (step.kind) {
    case "guided": {
      const placeholders = placeholdersOf(step.address, fields, where);
      return {
        ...base,
        kind: "guided",
        service,
        risk: definition.risk,
        address: step.address,
        placeholders,
      };
    }
    case "call": {
      const placeholders = placeholdersOf(step.path, fields, where);
      const body = step.body.map((field) => bodyFieldOf(field, fields, where));
      const route: ActionCallRoute = {
        ...base,
        kind: "call",
        service,
        risk: definition.risk,
        method: step.method,
        path: step.path,
        body,
        keep: step.keep,
        placeholders,
      };
      return route;
    }
    case "check":
      assert(
        step.changedAfterStart === undefined || step.keep.includes(step.changedAfterStart),
        `${where}: changedAfterStart "${step.changedAfterStart}" isn't a kept field`,
      );
      // A read runs without the native dialog, whatever the definition's risk (ToolScript ADR, S9).
      return {
        ...base,
        kind: "call",
        service,
        risk: "routine",
        method: "GET",
        path: step.path,
        body: [],
        keep: step.keep,
        placeholders: placeholdersOf(step.path, fields, where),
      };
    case "input":
    case "script":
    case "sign-in":
      return undefined;
  }
}

/**
 * The routes of a definition's steps, as the shell's generated route list
 * holds them (architecture note, 2.4): a `guided` step's address, a `call`
 * step's method, path, body and kept fields, and a `check` as a `GET` with no
 * body that runs without the native dialog. Each placeholder and body field
 * takes its pattern from the parameter of the same name. An `input`,
 * `script` or `sign-in` step has no route.
 *
 * @throws Error when a step names a placeholder or body field that isn't a
 *   parameter, or the parameters weren't built with `strictParameters`: a bug
 *   in the reviewed definition, which the catalog's tests catch
 *
 * @example
 * routesOf(definition).find((route) => route.step === 2);
 * // => { kind: "call", method: "PATCH", path: "/repos/{owner}/{repo}/…", placeholders: { owner: "^(?:…)$", … }, … }
 */
export function routesOf(definition: StepperDefinition): ActionRoute[] {
  const fields = parameterFieldsOf(definition.parameters) ?? {};
  return definition.steps.flatMap((step, index) => {
    const route = routeOf(definition, step, index + 1, fields);
    return route === undefined ? [] : [route];
  });
}
