/** The component list a reply is checked against, and the tree the reader gives. */

/** What a prop accepts. */
export type OpenUiPropType =
  | { readonly kind: "string"; readonly oneOf?: readonly string[] }
  | { readonly kind: "number" }
  | { readonly kind: "boolean" }
  | { readonly kind: "object" }
  | { readonly kind: "any" }
  /** A list of plain values. */
  | { readonly kind: "list"; readonly maxItems?: number }
  /** A list of components; any registered component fits (spec 8.4). */
  | { readonly kind: "components"; readonly maxItems?: number }
  /** What a click does: send a message to the agent or open a link. */
  | { readonly kind: "action" };

/** One prop, in its position in the call. */
export interface OpenUiProp {
  readonly name: string;
  readonly type: OpenUiPropType;
  readonly required?: boolean;
}

/** The registered components and the one a reply may start with when it has no `root`. */
export interface OpenUiLibrary {
  readonly root?: string;
  readonly components: Readonly<Record<string, readonly OpenUiProp[]>>;
}

/** A value in the tree. */
export type OpenUiValue =
  | string
  | number
  | boolean
  | null
  | readonly OpenUiValue[]
  | { readonly [key: string]: OpenUiValue }
  | OpenUiComponent
  | OpenUiAction;

/** A checked component: its type and its props by name. An empty prop is left out. */
export class OpenUiComponent {
  readonly type: string;
  readonly props: Readonly<Record<string, OpenUiValue>>;

  constructor(type: string, props: Readonly<Record<string, OpenUiValue>>) {
    this.type = type;
    this.props = props;
  }
}

/** The two actions a display reply may hold. */
export type OpenUiActionName = "ToAssistant" | "OpenUrl";

/** One step of an action and its arguments. */
export interface OpenUiActionStep {
  readonly action: OpenUiActionName;
  readonly args: readonly OpenUiValue[];
}

/** What a click does, in order: `ToAssistant` sends a message, `OpenUrl` opens a link. */
export class OpenUiAction {
  readonly actions: readonly OpenUiActionStep[];

  constructor(actions: readonly OpenUiActionStep[]) {
    this.actions = actions;
  }
}
