import type { InputField } from "./input-fields.ts";

/** One reviewed capability as a registry lists it: where it appears on `ctx`, and its typed input and result. */
export interface CapabilityEntry {
  /** The `ctx` namespace, such as `github`. */
  readonly namespace: string;
  /** The method name, such as `setVariable`. */
  readonly method: string;
  readonly input: unknown;
  readonly result: unknown;
}

/**
 * The capabilities one audience may use, by `id@version` such as
 * `github.set-variable@1`. User and agent registries are separate types, so a
 * `UserContext` can't name an agent capability (HAL-17560, S1 and S2).
 */
export type CapabilityRegistry = { readonly [reference: string]: CapabilityEntry };

/** A header as the context types read it: a `const` literal works, so `typeof header` fits. */
export interface HeaderShape {
  readonly audience: "user" | "agent";
  readonly inputs: Readonly<Record<string, InputField>>;
  readonly uses: readonly string[];
}

declare const secretHandleBrand: unique symbol;

/** An opaque handle to a secret the user typed in the shell. A script can pass it on, never read it (S7). */
export interface SecretHandle {
  readonly [secretHandleBrand]: true;
}

type ListItem =
  | { readonly type: "string" }
  | { readonly type: "integer" }
  | { readonly type: "enum"; readonly values: readonly string[] };

type ValueOf<Field> = Field extends { readonly type: "string"; readonly secret: true }
  ? SecretHandle
  : Field extends { readonly type: "string" }
    ? string
    : Field extends { readonly type: "integer" }
      ? number
      : Field extends { readonly type: "boolean" }
        ? boolean
        : Field extends {
              readonly type: "enum";
              readonly values: infer Values extends readonly string[];
            }
          ? Values[number]
          : Field extends { readonly type: "list"; readonly items: infer Item extends ListItem }
            ? readonly ValueOf<Item>[]
            : never;

/** The typed `ctx.input` of a header: one property per input, optional when the input is `optional`. */
export type InputsOf<Inputs extends HeaderShape["inputs"]> = {
  readonly [Name in keyof Inputs as Inputs[Name] extends { readonly optional: true }
    ? never
    : Name]: ValueOf<Inputs[Name]>;
} & {
  readonly [Name in keyof Inputs as Inputs[Name] extends { readonly optional: true }
    ? Name
    : never]?: ValueOf<Inputs[Name]>;
};

type UsedEntries<H extends HeaderShape, R extends CapabilityRegistry> = R[Extract<
  H["uses"][number],
  keyof R & string
>];

/** The `ctx` namespaces and methods a header's `uses` list gives, and nothing else (S3). */
export type UsedCapabilities<H extends HeaderShape, R extends CapabilityRegistry> = {
  readonly [Namespace in UsedEntries<H, R>["namespace"]]: {
    readonly [Entry in Extract<
      UsedEntries<H, R>,
      { readonly namespace: Namespace }
    > as Entry["method"]]: (input: Entry["input"]) => Promise<Entry["result"]>;
  };
};

/** What both audiences get that has no effect outside the isolate. */
interface SharedContext<H extends HeaderShape> {
  readonly input: InputsOf<H["inputs"]>;
  /** Adds a capped line to the run's log. Shown as "from the script" (S11). */
  log(message: string): void;
  /**
   * The time the host says it is, so a test replays exactly (P5). It answers
   * through the host like a capability, so it is async on a real isolate.
   */
  now(): Promise<string>;
  /** Stops the run with a reason. */
  fail(reason: string): never;
}

/** The `ctx` of a `user` ToolScript: shared helpers plus the user capabilities in `uses`. */
export type UserContext<
  H extends HeaderShape & { readonly audience: "user" },
  R extends CapabilityRegistry = CapabilityRegistry,
> = SharedContext<H> & UsedCapabilities<H, R> & { readonly audience: "user" };

/** The `ctx` of an `agent` ToolScript: shared helpers plus the agent capabilities in `uses`. */
export type AgentContext<
  H extends HeaderShape & { readonly audience: "agent" },
  R extends CapabilityRegistry = CapabilityRegistry,
> = SharedContext<H> & UsedCapabilities<H, R> & { readonly audience: "agent" };
