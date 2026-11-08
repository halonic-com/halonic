import type { UntrustedText } from "./untrusted-text.ts";

/** The seven JSON Schema types. */
export type JsonType = "null" | "boolean" | "object" | "array" | "number" | "string" | "integer";

/** The formats a listed tool's parameters may keep. */
export type ListedFormat =
  | "date-time"
  | "date"
  | "time"
  | "duration"
  | "email"
  | "uri"
  | "uuid"
  | "ipv4"
  | "ipv6"
  | "hostname";

/** A value an `enum` or `const` may hold. A string passes the name rule. */
export type ListedValue = null | boolean | number | string;

/**
 * A listed tool's parameters after the allow-list rebuild: only the keywords
 * requirement `ports.untrusted-tool-listings` keeps, each with the shape JSON
 * Schema defines. Every `description` and `title` is an {@link UntrustedText},
 * so tool assembly has to fence it before the schema can reach the model.
 */
export interface ListedSchema {
  type?: JsonType | JsonType[];
  properties?: Record<string, ListedSchema>;
  required?: string[];
  items?: ListedSchema;
  prefixItems?: ListedSchema[];
  additionalProperties?: boolean | ListedSchema;
  anyOf?: ListedSchema[];
  oneOf?: ListedSchema[];
  allOf?: ListedSchema[];
  /** Only at the root. A root `definitions` is read as `$defs`. */
  $defs?: Record<string, ListedSchema>;
  /** Always `#/$defs/<name>`, where `<name>` is an entry under the root's `$defs`. */
  $ref?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minProperties?: number;
  maxProperties?: number;
  format?: ListedFormat;
  enum?: ListedValue[];
  const?: ListedValue;
  description?: UntrustedText;
  title?: UntrustedText;
}
