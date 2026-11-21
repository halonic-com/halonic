import type { GitAnswer } from "./workspace-changes.ts";

/** The first non-empty line of what git said: its own message is never shown as raw output. */
function firstLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== "") ?? ""
  );
}

/** A plain sentence for the git failures people meet most, `null` for any other. */
export function knownGitProblem(answer: GitAnswer): string | null {
  const said = `${answer.stderr}\n${answer.stdout}`;
  if (/dubious ownership|safe\.directory/i.test(said)) {
    return "Git won't open this workspace because another user owns its folder. Run git config --global --add safe.directory with the path of the folder git names to allow it, then try again.";
  }
  if (/index\.lock|another git process/i.test(said)) {
    return "Another program is using this workspace's history right now. Wait a moment, then try again.";
  }
  if (/permission denied|operation not permitted|read-only file system/i.test(said)) {
    return "Git can't read or change this workspace's history. Check that you have permission to the folder.";
  }
  return null;
}

/** Why a read of the history failed: a plain sentence when known, otherwise git's first line. */
export function readableProblem(answer: GitAnswer): string {
  return knownGitProblem(answer) ?? firstLine(answer.stderr);
}

/** Why a version couldn't be created, as one plain sentence: git's own output is never shown. */
export function gitReason(answer: GitAnswer): string {
  const said = `${answer.stderr}\n${answer.stdout}`;
  if (/tell me who you are|empty ident name|author identity unknown/i.test(said)) {
    return "Git doesn't know who versions should be from. Set your name and email in git, then try again.";
  }
  if (/nothing (added )?to commit|no changes added/i.test(said)) {
    return "There is nothing to record: these changes are already in a version.";
  }
  if (/hook|permission denied|operation not permitted|read-only/i.test(said)) {
    return "Git refused to record the version. A check on this workspace or a permission stopped it.";
  }
  return knownGitProblem(answer) ?? "Git didn't accept the version.";
}

/** Why who versions are from couldn't be saved, as one plain sentence: git's own output is never shown. */
export function identityReason(answer: GitAnswer): string {
  return knownGitProblem(answer) ?? "Git didn't accept this name and email.";
}

/** Why a share address couldn't be added, as one plain sentence: git's own output is never shown. */
export function addressReason(answer: GitAnswer): string {
  const said = `${answer.stderr}\n${answer.stdout}`;
  if (/already exists/i.test(said)) return "This workspace already has a place to share to.";
  return knownGitProblem(answer) ?? "Git didn't accept this address.";
}

/** Why getting updates failed, as one plain sentence: git's own output is never shown. */
export function updatesReason(answer: GitAnswer): string {
  const said = `${answer.stderr}\n${answer.stdout}`;
  if (
    /no tracking information|no upstream|no such remote|couldn't find remote ref|does not appear to be a git repository/i.test(
      said,
    )
  ) {
    return "This workspace isn't set up to get updates yet.";
  }
  if (
    /could not resolve host|unable to access|could not read from remote|connection (refused|timed out)|network is unreachable/i.test(
      said,
    )
  ) {
    return "you can't reach the shared copy right now.";
  }
  if (/authentication failed|permission denied \(publickey\)|could not read username/i.test(said)) {
    return "the shared copy didn't accept your sign-in.";
  }
  if (/would be overwritten/i.test(said)) {
    return "updates would overwrite changes you haven't put in a version. Create a version first.";
  }
  return knownGitProblem(answer) ?? "Git didn't get the updates.";
}

/** Why sharing failed, as one plain sentence: git's own output is never shown. */
export function shareReason(answer: GitAnswer): string {
  const said = `${answer.stderr}\n${answer.stdout}`;
  if (/non-fast-forward|fetch first|\[rejected\]|failed to push some refs/i.test(said)) {
    return "the shared copy has versions you don't have yet. Get updates first.";
  }
  if (
    /could not resolve host|unable to access|could not read from remote|connection (refused|timed out)|network is unreachable/i.test(
      said,
    )
  ) {
    return "you can't reach the shared copy right now.";
  }
  if (/authentication failed|permission denied|could not read username/i.test(said)) {
    return "the shared copy didn't accept your sign-in.";
  }
  return knownGitProblem(answer) ?? "Git didn't share the versions.";
}
