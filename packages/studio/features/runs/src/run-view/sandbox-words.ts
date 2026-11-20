import type { DeniedPathGroupCode } from "@halonicjs/events";

/**
 * The words for what a step could do (microcopy 23.1), by a stable key, so the wording can change
 * without touching a component. `{name}` marks a value filled in at run time. The Your sign-in
 * rows have the words the board approved (HAL-1784, after the checks on HAL-1710).
 *
 * Never "safe", "secure" or "protected" (microcopy 1.4). The phone line names the agent's file,
 * not "Harness": the agent's Harness page has no sandbox setting yet (HAL-12658).
 */
export const sandboxWords = {
  "sandbox.line.sandbox": "In a sandbox",
  "sandbox.line.vm": "In a virtual machine",
  "sandbox.line.writes": "writes only in its working folder and its own temp and settings folders",
  "sandbox.line.reaches.halonic": "reaches only Halonic",
  "sandbox.line.reaches.one": "reaches Halonic and 1 site",
  "sandbox.line.reaches.many": "reaches Halonic and {count} sites",
  "sandbox.line.link": "What it can do",
  "sandbox.line.link-name": "What {step} can do",
  "sandbox.line.unreadable": "Couldn't read what this step could do.",
  "sandbox.line.off.desktop": "Ran on this computer, without the sandbox",
  "sandbox.line.off.phone": "Ran on your computer, without the sandbox",
  "sandbox.line.off-name": "Ran without the sandbox, in the step {step}",
  "sandbox.off.chip": "Full access",
  "sandbox.off.body.desktop":
    "You chose to run {agent} on this computer, so this step wasn't confined: it could reach what you can.",
  "sandbox.off.body.phone":
    "You chose to run {agent} on your computer, so this step wasn't confined: it could reach what you can.",
  "sandbox.panel.title.live": "What this step can do",
  "sandbox.panel.title.ended": "What this step could do",
  "sandbox.panel.writes": "Writes in",
  "sandbox.panel.writes.temp": "and its own temp and settings folders",
  "sandbox.panel.reads": "Can't change",
  "sandbox.panel.reads.more": "and {count} more",
  "sandbox.panel.denied": "Can't open",
  "sandbox.panel.denied.added": "Also: {paths}",
  "sandbox.panel.reaches": "Reaches",
  "sandbox.panel.reaches.halonic": "Halonic",
  "sandbox.panel.reaches.more": "and {count} more",
  "sandbox.panel.time": "Time limit",
  "sandbox.panel.time.value": "Stops after {time}",
  "sandbox.panel.sign-in": "Your sign-in",
  "sandbox.panel.sign-in.key":
    "{agent} never sees your API key. Halonic adds it to requests on their way to {provider}.",
  "sandbox.panel.sign-in.subscription.desktop":
    "With a {plan} subscription: saved in {agent}'s own settings folder on this computer. {agent} can read it while it runs.",
  "sandbox.panel.sign-in.subscription.phone":
    "With a {plan} subscription: saved in {agent}'s own settings folder on your computer. {agent} can read it while it runs.",
  "sandbox.sign-in.provider.anthropic": "Anthropic",
  "sandbox.sign-in.provider.openai": "OpenAI",
  "sandbox.sign-in.plan.anthropic": "Claude",
  "sandbox.sign-in.plan.openai": "ChatGPT",
  "sandbox.panel.kind.os.desktop": "A process sandbox on this computer, not a virtual machine.",
  "sandbox.panel.kind.os.phone": "A process sandbox on your computer, not a virtual machine.",
  "sandbox.panel.kind.vm.desktop": "A virtual machine on this computer.",
  "sandbox.panel.kind.vm.phone": "A virtual machine on your computer.",
  "sandbox.panel.kind.remote": "A sandbox on another machine.",
  "sandbox.panel.not-covered":
    "Not covered: if {agent} changes a build script in {folder}, that script runs without the sandbox the next time you build.",
  "sandbox.panel.phone-fix":
    "To change its folder or sites, edit workingFolder or allowedSites in {agent}'s file on your computer.",
  "sandbox.panel.action": "Change in {agent}'s settings",
  "sandbox.time.seconds.one": "1 second",
  "sandbox.time.seconds.many": "{count} seconds",
  "sandbox.time.minutes.one": "1 minute",
  "sandbox.time.minutes.many": "{count} minutes",
  "sandbox.time.hours.one": "1 hour",
  "sandbox.time.hours.many": "{count} hours",
  "sandbox.group.ssh-keys": "Your SSH keys",
  "sandbox.group.cloud-sign-ins": "Cloud and package sign-ins",
  "sandbox.group.browser-data": "Browser data",
  "sandbox.group.password-stores": "Password stores",
  "sandbox.group.registry-tokens": "Package registry tokens",
  "sandbox.group.shell-history": "Shell histories",
  "sandbox.group.halonic-data": "Halonic's own data",
  "sandbox.group.agent-settings": "Other agents' settings",
} as const satisfies Readonly<Record<string, string>>;

/** A key of {@link sandboxWords}. */
export type SandboxKey = keyof typeof sandboxWords;

/** The key naming a group of denied paths, one for each code the log can hold. */
export function groupKey(code: DeniedPathGroupCode): SandboxKey {
  return `sandbox.group.${code}`;
}

/** How many read-only paths the Can't change row shows before "and n more" (mc 23.1). */
export const readsShown = 3;
/** How many allowed sites the Reaches row shows before "and n more" (mc 23.1). */
export const sitesShown = 10;
