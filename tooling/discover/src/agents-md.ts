import { readFileSync } from "node:fs";
import { purposePlaceholder } from "@halonicjs/tooling-check";

const templateUrl = new URL("../templates/package-AGENTS.md", import.meta.url);
const featureApiNote = ", plus `src/api.ts` for other features";

/** What the `AGENTS.md` template needs to know about a package. */
export interface AgentsMdInput {
  readonly name: string;
  readonly owner: string;
  readonly layer: string;
  readonly isFeature: boolean;
  readonly purpose?: string;
}

/**
 * Fills in the `AGENTS.md` template.
 *
 * @throws when the template uses a placeholder this doesn't know, so a typo
 *   never ends up as `{{text}}` in a package
 */
export function renderAgentsMd(
  input: AgentsMdInput,
  template: string = readFileSync(templateUrl, "utf8"),
): string {
  const values: Readonly<Record<string, string>> = {
    packageName: input.name,
    owner: input.owner,
    layer: input.layer,
    oneLinePurpose: input.purpose?.trim() || purposePlaceholder,
    apiNote: input.isFeature ? featureApiNote : "",
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`package-AGENTS.md uses an unknown placeholder {{${key}}}.`);
    }
    return value;
  });
}
