import { readFileSync } from "node:fs";

/** The text of the pull request a GitHub Actions run is for. */
export interface PullRequestText {
  readonly branch: string;
  readonly title: string;
  readonly body: string;
  /**
   * Why this run has no Actions secrets, if it has none: GitHub gives them
   * neither to pull requests from forks nor to Dependabot's (Dependabot
   * gets only the separate Dependabot secrets).
   */
  readonly withoutSecrets?: "fork" | "dependabot";
}

/**
 * Reads the pull request from the event JSON at `$GITHUB_EVENT_PATH`. We
 * never pass this text through `env:`, because GitHub prints a step's
 * `env:` block in the public job log (plan 11.1).
 *
 * @returns `undefined` outside Actions, or when the event isn't a pull request
 */
export function readPullRequestText(
  eventPath: string | undefined = process.env["GITHUB_EVENT_PATH"],
): PullRequestText | undefined {
  if (eventPath === undefined || eventPath === "") {
    return undefined;
  }
  const event = JSON.parse(readFileSync(eventPath, "utf8")) as {
    pull_request?: {
      title?: string;
      body?: string | null;
      user?: { login?: string };
      head?: { ref?: string; repo?: { full_name?: string } | null };
      base?: { repo?: { full_name?: string } };
    };
  };
  const pullRequest = event.pull_request;
  if (pullRequest === undefined) {
    return undefined;
  }
  const text = {
    branch: pullRequest.head?.ref ?? "",
    title: pullRequest.title ?? "",
    body: pullRequest.body ?? "",
  };
  if (pullRequest.user?.login === "dependabot[bot]") {
    return { ...text, withoutSecrets: "dependabot" };
  }
  if (pullRequest.head?.repo?.full_name !== pullRequest.base?.repo?.full_name) {
    return { ...text, withoutSecrets: "fork" };
  }
  return text;
}
