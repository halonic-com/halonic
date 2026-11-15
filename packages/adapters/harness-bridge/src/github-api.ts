import type { BridgeToolResult, Secrets } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";

/** The one host the GitHub tools call. GitHub's API is the only place the bridge sends the secret. */
export const githubApi = "https://api.github.com";

/** What a tool read: the text, and whether GitHub's answer was longer than the bridge reads. */
export interface ToolOutput {
  text: string;
  cut: boolean;
}

export const whole = (text: string): ToolOutput => ({ text, cut: false });

/**
 * The GitHub token in the secret `name`, which must go in a header as it is:
 * visible ASCII only. Read on each call, so a token that was renewed is used
 * at once.
 * @throws GitHubToolError when the secret isn't set, isn't a token or can't be read
 */
export async function readToken(secrets: Secrets, name: string): Promise<string> {
  const token = await lookUp(secrets, name);
  if (token === null) {
    throw new GitHubToolError(`The secret "${name}" that holds the GitHub token isn't set.`);
  }
  if (!/^[\x21-\x7e]+$/.test(token)) {
    throw new GitHubToolError(`The secret "${name}" holds something that isn't a token.`);
  }
  return token;
}

/**
 * The text of a reply, read only up to `maxBytes`: it stops at the first byte
 * over, without reading the rest into memory.
 */
export async function readCapped(reply: Response, maxBytes: number): Promise<ToolOutput> {
  if (reply.body === null) return whole("");
  const reader = reply.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size <= maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  const cut = size > maxBytes;
  if (cut) await reader.cancel();
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return { text: new TextDecoder().decode(all.subarray(0, maxBytes)), cut };
}

/**
 * The secret's value, or `null` when it isn't set. When the store fails, the
 * error names the secret and gives the store's own message, which by the
 * `Secrets` port never holds a value.
 */
async function lookUp(secrets: Secrets, name: string): Promise<string | null> {
  try {
    return await secrets.get(name);
  } catch (error) {
    const cause = error instanceof Error ? error.message : "it failed for an unknown reason";
    throw new GitHubToolError(`The secret "${name}" could not be read: ${cause}`);
  }
}

/** A failure whose text the program may read, because it never holds the token or GitHub's own words. */
export class GitHubToolError extends Error {}

/** True for `owner/name`, where neither part is `.` or `..`, which would climb out of the repository's path. */
export function isRepository(repository: string): boolean {
  const parts = repository.split("/");
  return (
    parts.length === 2 &&
    parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part) && part !== "." && part !== "..")
  );
}

export function failed(result: string): BridgeToolResult {
  return { result, outcome: "error" };
}

export function describeFailure(status: number): string {
  if (status === 401) return "GitHub refused the token (401).";
  if (status === 403)
    return "GitHub refused the call (403): the token may lack access or be rate limited.";
  if (status === 404)
    return "GitHub has no such pull request in this repository, or the token can't see it (404).";
  if (status === 422)
    return "GitHub didn't accept the request (422): for instance a branch is missing, or a pull request for the branch is already open.";
  if (status >= 300 && status < 400)
    return `GitHub answered with a redirect (${status}), which the bridge doesn't follow.`;
  return `GitHub answered with status ${status}.`;
}

export function asObject(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value))
    throw new GitHubToolError("GitHub's answer wasn't what the bridge expects.");
  return value;
}

/** The fields of `source` named in `names`, as readable JSON. */
export function pick(
  source: Record<string, unknown>,
  names: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(names.map((name) => [name, source[name]]));
}
