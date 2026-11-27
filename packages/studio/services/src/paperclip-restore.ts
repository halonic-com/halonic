// When Studio asks the shell to give a workspace's Paperclip keys back
// (`services.paperclip-restore`). What goes back, and to which workspace, is
// the shell's to decide (`studio.src-tauri.paperclip-key-keep`, HAL-20278):
// no page code reads, writes or holds a key.

/** The open workspace's trust, as {@link restoreWhenMayStart} reads it. */
export interface RestoreTrust {
  /**
   * Whether the last settled trust check lets something start: the person
   * trusted the workspace, or it reaches only the test model. No while a
   * check runs and after one that failed.
   */
  mayStartNow(): boolean;
  /** Calls `listener` whenever a trust check starts or ends; returns the way to stop. */
  subscribe(listener: () => void): () => void;
}

/**
 * Runs `restore` once, as soon as the open workspace may start something:
 * at once when it may already, else when a later check says so. That is the
 * rule runs start by: the person trusted the workspace, or it reaches only
 * the test model, as the demo does, a Paperclip connection file included.
 * Until then it asks the shell and the agent host nothing, so opening a
 * folder nobody trusted that needs trust starts nothing, the host included
 * (`services.paperclip-restore`, `studio.untrusted-starts-nothing`). The page's
 * word can only hold a restore back: the shell asks the host itself whether
 * the workspace may start before it hands any key over.
 *
 * It runs once: a later change of files, or of trust, doesn't take back a key
 * the host already holds, as after the person removes trust today.
 *
 * @param restore - never rejects, as `HostAgentConnections.restore` reports its own failures
 * @returns the way to stop waiting
 */
export function restoreWhenMayStart(trust: RestoreTrust, restore: () => Promise<void>): () => void {
  let started = false;
  const startOnceAllowed = () => {
    if (started || !trust.mayStartNow()) return;
    started = true;
    stop();
    void restore();
  };
  const stop = trust.subscribe(startOnceAllowed);
  startOnceAllowed();
  return stop;
}
