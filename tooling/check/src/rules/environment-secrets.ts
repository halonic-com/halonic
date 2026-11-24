import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";

const workflowFile = /^\.github\/workflows\/[^/]+\.ya?ml$/;

/** One `${{ … }}` expression. */
const expression = /\$\{\{([^}]*)\}\}/g;

/** A secret read inside an expression: `secrets.NAME` or `secrets[…]`. */
const secretRead = /\bsecrets\s*(?:\.\s*([A-Za-z_][\w-]*)|\[)/g;

/** One job of a workflow, by its lines. */
interface Job {
  readonly id: string;
  readonly line: number;
  readonly body: readonly { readonly text: string; readonly line: number }[];
}

function indentOf(text: string): number {
  return text.length - text.trimStart().length;
}

function isBlankOrComment(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

/**
 * The jobs under the top-level `jobs:` key. Reads indentation only, which
 * is enough for the workflows' block style; a job written in flow style
 * (`job: { … }`) has no body lines and so reads no secrets here.
 */
function jobsOf(text: string): Job[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line));
  if (start === -1) {
    return [];
  }
  const jobs: { id: string; line: number; body: { text: string; line: number }[] }[] = [];
  let jobIndent = -1;
  for (let index = start + 1; index < lines.length; index++) {
    const text = lines[index] ?? "";
    if (isBlankOrComment(text)) {
      continue;
    }
    const indent = indentOf(text);
    if (indent === 0) {
      break;
    }
    if (jobIndent === -1) {
      jobIndent = indent;
    }
    if (indent === jobIndent) {
      jobs.push({ id: text.trim().replace(/:.*$/, ""), line: index + 1, body: [] });
    } else {
      jobs.at(-1)?.body.push({ text, line: index + 1 });
    }
  }
  return jobs;
}

/** Whether the job has its own `environment:` key. */
function hasEnvironment(job: Job): boolean {
  const keys = job.body.filter(({ text }) => !isBlankOrComment(text));
  const keyIndent = Math.min(...keys.map(({ text }) => indentOf(text)));
  return keys.some(({ text }) => indentOf(text) === keyIndent && /^\s*environment\s*:/.test(text));
}

/** The secrets a job reads, other than `GITHUB_TOKEN`, as written, with the line of each. */
function secretsReadBy(job: Job): { name: string; line: number }[] {
  const reads: { name: string; line: number }[] = [];
  for (const { text, line } of job.body) {
    if (isBlankOrComment(text)) {
      continue;
    }
    if (/^\s*secrets\s*:\s*inherit\b/.test(text)) {
      reads.push({ name: "secrets: inherit", line });
    }
    for (const [, inside = ""] of text.matchAll(expression)) {
      for (const [, name] of inside.matchAll(secretRead)) {
        if (name !== "GITHUB_TOKEN") {
          reads.push({ name: `secrets.${name ?? "[…]"}`, line });
        }
      }
    }
  }
  return reads;
}

/**
 * Fails when a workflow job reads a secret other than `GITHUB_TOKEN`
 * without running in a GitHub environment (HAL-17794). A repository secret
 * reaches any run from a branch of this repository, and that branch's copy
 * of the workflow decides what it does with it; a secret kept in an
 * environment limited to `main` or release tags reaches only those.
 * Whether the environment really is limited is a repository setting this
 * check can't see.
 */
export function checkEnvironmentSecrets(context: CheckContext): Report {
  const report = new Report("environment-secrets");
  for (const file of context.files.filter((name) => workflowFile.test(name))) {
    for (const job of jobsOf(context.read(file))) {
      if (hasEnvironment(job)) {
        continue;
      }
      for (const { name, line } of secretsReadBy(job)) {
        report.error(
          file,
          `Job "${job.id}" reads ${name} without an environment. Give the job an \`environment:\` limited to the branches or tags that need the secret, and keep the secret in that environment, not in the repository.`,
          line,
        );
      }
    }
  }
  return report;
}
