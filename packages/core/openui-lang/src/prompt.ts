/**
 * The text that goes into an agent's prompt to tell the model what it may draw. It is made
 * from the component list itself, so the prompt and the reader's checks can't drift apart.
 */

import {
  CHAT_ROOT,
  type ChatComponentName,
  type ComponentSpec,
  chatComponentSpecs,
  type DescribedProp,
} from "./components.ts";
import type { OpenUiPropType } from "./library.ts";

/** The prompt text for the given components, or an empty string when none is switched on. */
export function promptFor(names: readonly ChatComponentName[]): string {
  const specs = chatComponentSpecs(names);
  if (specs.length === 0) return "";
  const types = specs.map((spec) => spec.type).join(", ");
  return [
    "You may draw parts of your reply with OpenUI Lang 1.1, display part only.",
    `Start with root = ${CHAT_ROOT}([...]), holding only these components: ${types}.`,
    "Arguments go in the order shown; ? marks one you may leave out.",
    "There is no Query, Mutation, $state, expression or @ function.",
    "There are no styles, colours, icons or images; anything else is left out.",
    "",
    ...specs.flatMap((spec) => [
      describe(spec, ""),
      ...(spec.parts ?? []).map((part) => describe(part, "  ")),
    ]),
  ].join("\n");
}

function describe(spec: ComponentSpec, indent: string): string {
  const args = spec.props.map(signatureOf).join(", ");
  const details = spec.props.map((prop) => `${prop.name}: ${prop.description}`).join("; ");
  return `${indent}- ${spec.type}(${args}): ${spec.description} ${details}.`;
}

function signatureOf(prop: DescribedProp): string {
  return `${prop.name}${prop.required ? "" : "?"}: ${typeName(prop.type)}`;
}

function typeName(type: OpenUiPropType): string {
  switch (type.kind) {
    case "components":
      return type.only ? `[${type.only.join(" | ")}]` : "[component]";
    case "list":
      return "[value]";
    case "link":
      return "string";
    default:
      return type.kind;
  }
}
