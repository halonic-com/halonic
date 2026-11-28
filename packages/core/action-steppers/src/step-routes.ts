import { isActionKeptName } from "@halonicjs/events";
import type { ActionBodyField, ActionCallRoute, ActionRoute } from "@halonicjs/ports";
import { assert } from "@halonicjs/std";
import type { CallBodyField, CheckStep, Step, StepperDefinition } from "./stepper-types.ts";
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
  if (field.kind === "parameter-list") {
    const item = fieldOf(fields, field.parameter, where);
    assert(
      item.kind === "integer",
      `${where}: list field ${field.name} needs an integer parameter, and {${field.parameter}} isn't one`,
    );
    return { name: field.name, kind: "integer-list" };
  }
  const parameter = fieldOf(fields, field.name, where);
  if (parameter.kind === "integer") return { name: field.name, kind: "integer" };
  return { name: field.name, kind: "string", pattern: patternOf(field.name, parameter) };
}

/**
 * Each field a check's `requires` and `requiredExpect` name must be kept, and each parameter exist.
 * A `requiredExpect` name must also be plain, since a request's `expect` takes no dotted name.
 */
function assertCheckNames(step: CheckStep, fields: Fields, where: string): void {
  for (const rule of step.requires ?? []) {
    assert(step.keep.includes(rule.name), `${where}: requires ${rule.name} isn't a kept field`);
    if ("equalsParameter" in rule) fieldOf(fields, rule.equalsParameter, where);
  }
  for (const name of step.requiredExpect ?? []) {
    assert(step.keep.includes(name), `${where}: requiredExpect ${name} isn't a kept field`);
    assert(!name.includes("."), `${where}: requiredExpect ${name} isn't a plain name`);
  }
}

/** The step's kept names, each one `isActionKeptName` allows, as the shell's route list checks them. */
function keptOf(keep: readonly string[], where: string): readonly string[] {
  for (const name of keep) {
    assert(isActionKeptName(name), `${where}: "${name}" isn't a kept field name`);
  }
  return keep;
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
        keep: keptOf(step.keep, where),
        placeholders,
      };
      return route;
    }
    case "check":
      assert(
        step.changedAfterStart === undefined || step.keep.includes(step.changedAfterStart),
        `${where}: changedAfterStart "${step.changedAfterStart}" isn't a kept field`,
      );
      assertCheckNames(step, fields, where);
      // A read runs without the native dialog, whatever the definition's risk (ToolScript ADR, S9).
      return {
        ...base,
        kind: "call",
        service,
        risk: "routine",
        method: "GET",
        path: step.path,
        body: [],
        keep: keptOf(step.keep, where),
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
 * takes its pattern from the parameter of the same name; a `parameter-list`
 * field is an `integer-list`. An `input`,
 * `script` or `sign-in` step has no route.
 *
 * @throws Error when a step names a placeholder or body field that isn't a
 *   parameter, keeps a field under a name `isActionKeptName` refuses (more
 *   than 3 dotted keys, or a list index), a list field whose parameter isn't an
 *   integer, a `requires` rule or `requiredExpect` name a field its check doesn't
 *   keep or a parameter that doesn't exist, a dotted `requiredExpect` name, or the parameters weren't built with
 *   `strictParameters`: a bug in the reviewed definition, which the catalog's tests catch
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
