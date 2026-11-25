import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/**
 * The sentences of `halonic deploy <deployment>` before anything changes on
 * Cloudflare (deploy flow, revision 5): its flags, the heading (2.8), the
 * summary's rows (2.7), `--plan` (2.11), the secrets it
 * asks for (2.6), and the gate's refusals and warnings (3.6).
 */
export const deployPlanMessages = defineMessages("deployPlan", {
  planOption: () => phrase`Show what the deploy would do, and change nothing on Cloudflare`,
  exitCodeOption: () => phrase`With --plan: exit 1 when the deploy would change something, for CI`,
  oneDeployment: () => phrase`halonic deploy takes one deployment. Run it once for each.`,
  exitCodeNeedsPlan: () => phrase`--exit-code works only with --plan.`,

  /** 2.8: "Deploying Acme to web", then the host, the account and the commit. */
  deploying: (workspace: string, deployment: string) =>
    phrase`Deploying ${workspace} to ${deployment}`,
  where: (host: string, account: string, commit: string) =>
    phrase`  ${host} ${markPart("separator")} ${account} ${markPart("separator")} commit ${commit}`,
  checked: (workspace: string) =>
    phrase`${markPart("done")} Checked ${workspace} for Cloudflare. No problems.`,
  took: (files: number, commit: string) =>
    phrase`${markPart("done")} Took ${files === 1 ? "1 file" : `${files} files`} from commit ${commit}.`,

  accountLabel: () => phrase`Account`,
  addressLabel: () => phrase`Address`,
  filesLabel: () => phrase`Files`,
  createsLabel: () => phrase`Creates`,
  dataLabel: () => phrase`Data`,
  reachesLabel: () => phrase`Reaches`,
  routinesLabel: () => phrase`Routines`,
  secretsLabel: () => phrase`Secrets`,
  value: (text: string) => phrase`${text}`,
  files: (count: number, commit: string, subject: string) =>
    phrase`${count} from commit ${commit} "${subject}"`,
  inTheEu: () => phrase`in the EU`,
  reach: (address: string, secret: string | undefined) =>
    secret === undefined ? phrase`${address}, with no secret` : phrase`${address}, with ${secret}`,
  reachesNothing: () => phrase`nothing outside Cloudflare`,
  routines: (count: number) =>
    count === 1
      ? phrase`1, which then also runs while this computer is off`
      : phrase`${count}, which then also run while this computer is off`,
  /** 2.11: each file the deploy uploads, under the summary. */
  uploadFile: (path: string) => phrase`    ${path}`,
  planEnd: () => phrase`Nothing changed on Cloudflare. Run without --plan to deploy.`,

  /** 2.6: a secret the workspace needs, asked for with what names it. */
  secretNeeded: (workspace: string, what: string, secret: string) =>
    phrase`${workspace}'s ${what} needs the secret ${secret} on Cloudflare.`,
  secretPaste: () => phrase`Paste it. It won't show on screen.`,
  secretPrompt: (secret: string) => phrase`${secret}: `,

  /** 3.6: the gate. */
  cannotRun: (count: number, workspace: string) =>
    phrase`${count} things in ${workspace} can't run on Cloudflare. Nothing changed on Cloudflare.`,
  cannotRunOne: (reason: string) => phrase`${reason} Nothing changed on Cloudflare.`,
  cannotRunFix: (deployment: string) =>
    phrase`Give each one an internet address instead, or leave it out of the hubs ${deployment} uses.`,
  cannotRunOneFix: (deployment: string) =>
    phrase`Give it an internet address instead, or leave it out of the hubs ${deployment} uses.`,
  /** 3.6: the fix for one program, plugin or integration, which only runs on this computer. */
  cannotRunOneHereFix: (deployment: string, workspace: string) =>
    phrase`Leave it out of the hubs ${deployment} uses, or run ${workspace} with halonic serve on your own machine.`,
  problem: (path: string, reason: string) => phrase`${path}   ${reason}  (capability-missing)`,
  uncommitted: (count: number) =>
    count === 1
      ? phrase`1 file has changes that aren't committed. Nothing changed on Cloudflare.`
      : phrase`${count} files have changes that aren't committed. Nothing changed on Cloudflare.`,
  uncommittedFix: () => phrase`Commit them (git status lists them), then run again.`,
  uncommittedDevelopment: (count: number, commit: string) =>
    count === 1
      ? phrase`${markPart("needsYou")} 1 file has changes that aren't committed, so it isn't deployed. This deploys commit ${commit}.`
      : phrase`${markPart("needsYou")} ${count} files have changes that aren't committed, so they aren't deployed. This deploys commit ${commit}.`,
});
