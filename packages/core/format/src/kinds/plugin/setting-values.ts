// Whether a value can be saved for one of a plugin's settings, by the rules
// the manifest's own `default` follows (ADR 2026-11-09-plugins, section 1.4).
// The app checks every value a person saves with it, so a saved value is
// always one the manifest could have written.
import { s } from "@halonicjs/schema-kit";
import type { PluginUi } from "./schema.ts";

/** One setting field, as a plugin's `ui.settings` declares it. */
export type PluginSettingField = PluginUi["settings"][string];

/** A value saved for a setting. A `secret` setting has none here: its value goes to `Secrets`. */
export type PluginSettingValue = string | number | boolean;

/** An `http` or `https` URL as `URL` writes it, the rule of a `url` field's `default`. */
const url = s.url();

/**
 * Why `value` can't be saved for `field`, or `null` when it can. A `secret`
 * field never takes a value here, because its value goes to `Secrets`.
 *
 * @param field - the setting, as the manifest declares it
 * @param value - what the person entered
 * @returns a message for the person, or `null`
 *
 * @example
 * settingValueProblem({ type: "number", label: "Days", required: false }, "3"); // "use a number"
 */
export function settingValueProblem(field: PluginSettingField, value: unknown): string | null {
  switch (field.type) {
    case "secret":
      return "this is a secret, which is kept in Secrets, not with the settings";
    case "text":
      return typeof value === "string" ? null : "use text";
    case "url":
      return url.safeParse(value).success
        ? null
        : "use an http or https address, such as 'https://example.com'";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "use a number";
    case "boolean":
      return typeof value === "boolean" ? null : "use true or false";
    case "choice":
      return typeof value === "string" && field.choices.includes(value)
        ? null
        : `use one of ${field.choices.map((choice) => `'${choice}'`).join(", ")}`;
  }
}
