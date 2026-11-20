// The Plugins line of `halonic doctor`, without the words: each plugin a
// workspace's connector uses that isn't added, is off or can't be read
// (HAL-14296). The host finds them, because only the host knows where the
// profile's plugins are; this file only decides the mark.

import type { DoctorLine } from "./doctor-checks.ts";

/**
 * What is wrong with a plugin a connector uses: it isn't added, with a near
 * id when one is close; it is `off` until a person trusts it, or trusts it
 * again after a change; or its folder can't be read or checked (`broken`).
 */
export type DoctorPluginProblem =
  | {
      problem: "not-added";
      /** The connector's id, such as "orders". */
      connector: string;
      /** The plugin id the connector names, such as "acme-order". */
      plugin: string;
      /** The one added plugin whose id is close, such as "acme-orders", or `undefined`. */
      near: string | undefined;
    }
  | { problem: "off"; plugin: string; why: "not-trusted" | "changed" }
  | { problem: "broken"; plugin: string };

/** The Plugins line: shown only when a plugin a connector uses has a problem. */
export interface PluginsLine extends DoctorLine {
  check: "plugins";
  /** `failed` while a plugin isn't added; a plugin that is only off is a warning. */
  status: "warning" | "failed";
  /** In the order the host found them. Never empty. */
  problems: DoctorPluginProblem[];
}

/**
 * The Plugins line of `halonic doctor` (requirement `app.doctor-plugins`),
 * or `undefined` when every plugin the connectors use is on. A plugin that
 * isn't added fails the line, so `doctor` exits 1: no run can get its tools.
 * One that is off is a warning, because trusting it is the person's choice.
 *
 * @example
 * pluginsLine([{ problem: "off", plugin: "acme-orders", why: "changed" }]);
 * // { check: "plugins", status: "warning", problems: [{ problem: "off", … }] }
 */
export function pluginsLine(problems: readonly DoctorPluginProblem[]): PluginsLine | undefined {
  if (problems.length === 0) return undefined;
  const notAdded = problems.some((found) => found.problem === "not-added");
  return { check: "plugins", status: notAdded ? "failed" : "warning", problems: [...problems] };
}
