// The Agents section's rows of the workspace trust check: an agent, its allowed sites, its
// working folder and what it does without asking, and what changed in each (mockup-trust rev 2).

import { defaultWorkingFolder } from "@halonicjs/format";
import type { TrustRowView } from "@halonicjs/studio-feature-workspace";
import type { AgentTrustContent, ChangedAgent } from "@halonicjs/workspace";
import { harnessName } from "./harness-name.ts";

/** An agent's row: the program it runs in, its allowed sites, its working folder. */
export function agentRow(agent: AgentTrustContent): TrustRowView {
  return {
    id: agent.id,
    detail: harnessName(agent.harness),
    lines: [
      ...agent.allowedSites.map(
        (site, index) => [index === 0 ? "Allowed sites" : "", shownSite(site)] as const,
      ),
      ...(agent.workingFolder === undefined
        ? []
        : [["Working folder", agent.workingFolder] as const]),
      ...(agent.asks === "in-sandbox" ? [[withoutAsking, inSandboxCalls] as const] : []),
    ],
  };
}

/** The label over what an agent with `asks: in-sandbox` does without a person's OK. */
export const withoutAsking = "Without asking";

/**
 * What it does (team wording, HAL-14992), in the CLI row's words: a fenced
 * run's agent host answers those calls (HAL-15287), so the row no longer says
 * this version of Halonic still asks first (HAL-15702).
 */
const inSandboxCalls = "will edit and run commands in its working folder, inside the sandbox";

/** One Changed row per agent, saying what is different. */
export function agentChangeRows(agent: ChangedAgent): TrustRowView[] {
  const { before, after } = agent;
  const lines: (readonly [string, string])[] = [];
  if (before.harness !== after.harness) {
    lines.push(["Program", `${harnessName(before.harness)} → ${harnessName(after.harness)}`]);
  }
  const added = after.allowedSites.filter((site) => !before.allowedSites.includes(site));
  const removed = before.allowedSites.filter((site) => !after.allowedSites.includes(site));
  if (added.length > 0) lines.push(["Now also allows", added.join(", ")]);
  if (removed.length > 0) lines.push(["No longer allows", removed.join(", ")]);
  const folder = (content: AgentTrustContent) =>
    content.workingFolder ?? defaultWorkingFolder(content.id);
  if (folder(before) !== folder(after)) {
    lines.push(["Working folder", `${folder(before)} → ${folder(after)}`]);
  }
  if (before.asks !== after.asks) {
    lines.push(
      after.asks === "in-sandbox"
        ? [withoutAsking, inSandboxCalls]
        : ["Asks again", "before it edits or runs a command"],
    );
  }
  return [{ id: agent.id, detail: harnessName(after.harness), lines }];
}

/** A site in its stored form, with its note: a wildcard names its domain, Punycode is flagged. */
function shownSite(site: string): string {
  const notes = [
    ...(site.startsWith("*.") ? [`every site under ${site.slice(2)}`] : []),
    ...(site.split(".").some((label) => label.startsWith("xn--")) ? ["(non-Latin letters)"] : []),
  ];
  return [site, ...notes].join(" · ");
}
