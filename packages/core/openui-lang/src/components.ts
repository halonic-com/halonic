/**
 * The chat's component list: card, table, form and buttons, as approved on HAL-17107.
 *
 * Every prop is positional, and only the props listed here exist, so a style, a class, a
 * button variant, a colour or an icon is an extra argument the reader leaves out and
 * reports. Anything not listed, an image included, is an unknown component.
 */

import type { OpenUiLibrary, OpenUiProp } from "./library.ts";
import { OPENUI_MAX_COLUMNS, OPENUI_MAX_FIELDS } from "./limits.ts";

/** The components an agent may switch on, by the name its settings use. */
export type ChatComponentName = "card" | "table" | "form" | "buttons";

/** The form fields the board approved; a password, file or date field doesn't fit. */
export const FORM_FIELD_KINDS = ["text", "longText", "list", "choice", "tickBox"] as const;

/** One prop with the words that tell the model what it is for. */
export interface DescribedProp extends OpenUiProp {
  readonly description: string;
}

/** One component in the language, with the parts that only it may hold. */
export interface ComponentSpec {
  readonly type: string;
  readonly description: string;
  readonly props: readonly DescribedProp[];
  readonly parts?: readonly ComponentSpec[];
}

/** The component a reply starts with; it holds the switched-on components in order. */
export const CHAT_ROOT = "Stack";

const fact: ComponentSpec = {
  type: "Fact",
  description: "A short label and value row.",
  props: [
    { name: "label", type: { kind: "string" }, required: true, description: "the label" },
    { name: "value", type: { kind: "string" }, required: true, description: "the value" },
  ],
};

const link: ComponentSpec = {
  type: "Link",
  description: "A link the user may open with a click. The user sees its real host.",
  props: [
    { name: "label", type: { kind: "string" }, required: true, description: "what it links to" },
    {
      name: "url",
      type: { kind: "link" },
      required: true,
      description: "an http or https address",
    },
  ],
};

const card: ComponentSpec = {
  type: "Card",
  description: "A title, some text, short facts and links.",
  props: [
    { name: "title", type: { kind: "string" }, required: true, description: "the title" },
    { name: "text", type: { kind: "string" }, description: "a few sentences" },
    { name: "facts", type: { kind: "components", only: ["Fact"] }, description: "Fact rows" },
    { name: "links", type: { kind: "components", only: ["Link"] }, description: "Links" },
  ],
  parts: [fact, link],
};

const row: ComponentSpec = {
  type: "Row",
  description: "One table row.",
  props: [
    {
      name: "cells",
      type: { kind: "list", maxItems: OPENUI_MAX_COLUMNS, plainOnly: true },
      required: true,
      description: "one text, number or true/false per column",
    },
  ],
};

const table: ComponentSpec = {
  type: "Table",
  description: "Rows of plain values under column names.",
  props: [
    {
      name: "columns",
      type: { kind: "list", maxItems: OPENUI_MAX_COLUMNS, plainOnly: true },
      required: true,
      description: "the column names",
    },
    {
      name: "rows",
      type: { kind: "components", only: ["Row"] },
      required: true,
      description: "Rows",
    },
    { name: "caption", type: { kind: "string" }, description: "a line above the table" },
  ],
  parts: [row],
};

const field: ComponentSpec = {
  type: "Field",
  description: "One question in a form.",
  props: [
    { name: "label", type: { kind: "string" }, required: true, description: "the question" },
    {
      name: "kind",
      type: { kind: "string", oneOf: FORM_FIELD_KINDS },
      required: true,
      description: FORM_FIELD_KINDS.map((kind) => `"${kind}"`).join(", "),
    },
    {
      name: "options",
      type: { kind: "list", plainOnly: true },
      description: 'the answers to pick from, for "list" and "choice"',
    },
  ],
};

const form: ComponentSpec = {
  type: "Form",
  description: "Questions the user answers; sending it sends the answers as their message.",
  props: [
    { name: "title", type: { kind: "string" }, required: true, description: "the title" },
    {
      name: "fields",
      type: { kind: "components", maxItems: OPENUI_MAX_FIELDS, only: ["Field"] },
      required: true,
      description: "Fields",
    },
    {
      name: "submit",
      type: { kind: "string" },
      required: true,
      description: "the words on the send button",
    },
  ],
  parts: [field],
};

const button: ComponentSpec = {
  type: "Button",
  description: "A button; a click sends its label as the user's message.",
  props: [{ name: "label", type: { kind: "string" }, required: true, description: "its words" }],
};

const buttons: ComponentSpec = {
  type: "Buttons",
  description: "A row of buttons.",
  props: [
    {
      name: "buttons",
      type: { kind: "components", only: ["Button"] },
      required: true,
      description: "Buttons",
    },
  ],
  parts: [button],
};

/** Every component an agent may switch on, by its settings name. */
export const CHAT_COMPONENTS: Readonly<Record<ChatComponentName, ComponentSpec>> = {
  card,
  table,
  form,
  buttons,
};

/** The specs for the given names, in the list's own order, each once. */
export function chatComponentSpecs(names: readonly ChatComponentName[]): ComponentSpec[] {
  const chosen = new Set(names);
  return (Object.keys(CHAT_COMPONENTS) as ChatComponentName[])
    .filter((name) => chosen.has(name))
    .map((name) => CHAT_COMPONENTS[name]);
}

/** The library a reply is read against when the given components are switched on. */
export function chatLibrary(names: readonly ChatComponentName[]): OpenUiLibrary {
  const specs = chatComponentSpecs(names);
  const components: Record<string, readonly OpenUiProp[]> = {
    [CHAT_ROOT]: [
      {
        name: "children",
        type: { kind: "components", only: specs.map((spec) => spec.type) },
        required: true,
      },
    ],
  };
  for (const spec of specs) {
    for (const part of [spec, ...(spec.parts ?? [])]) components[part.type] = part.props;
  }
  return { root: CHAT_ROOT, components };
}
