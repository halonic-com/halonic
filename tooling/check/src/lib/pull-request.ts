import { readFileSync } from "node:fs";

/** The text of the pull request a GitHub Actions run is for. */
export interface PullRequestText {
  readonly branch: string;
  readonly title: string;
  readonly body: string;
  /**
   * The login and display name of the account that opened the pull request,
   * "login Name". The merge queue's squash commit is authored by that account,
   * so its name and noreply address land in the commit `main` gets.
   */
  readonly author: string;
}

/**
 * Reads the pull request from the event JSON at `$GITHUB_EVENT_PATH`. We
 * never pass this text through `env:`, because GitHub prints a step's
 * `env:` block in the public job log. GitHub's event has the opener's login
 * but not their name; leak-terms.yml adds `user.name` to its copy.
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
      head?: { ref?: string };
      user?: { login?: string; name?: string | null };
    };
  };
  const pullRequest = event.pull_request;
  if (pullRequest === undefined) {
    return undefined;
  }
  const author = [pullRequest.user?.login, pullRequest.user?.name].filter(Boolean).join(" ");
  return {
    branch: pullRequest.head?.ref ?? "",
    title: pullRequest.title ?? "",
    body: pullRequest.body ?? "",
    author,
  };
}
