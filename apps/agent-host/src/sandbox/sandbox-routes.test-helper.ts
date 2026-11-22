// Fakes the sandbox route tests share.

import type {
  Sandbox,
  SandboxBlockListener,
  SandboxCapabilities,
  SandboxCheck,
  SandboxFence,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import type { BuiltProfiles } from "./built-profiles.ts";

/**
 * Takes every profile, for tests about sessions rather than about which
 * profiles open one (built-profile-sessions.test.ts covers that).
 */
export const anyProfile: BuiltProfiles = { take: () => true };

/** A session that counts its closes. */
export class FakeSession implements SandboxSession {
  readonly listeners = new Set<SandboxBlockListener>();
  fence: SandboxFence = { state: "fenced" };
  closeCount = 0;
  readonly profile: SandboxProfile;

  constructor(profile: SandboxProfile) {
    this.profile = profile;
  }

  start(): never {
    throw new Error("not used here");
  }

  onBlocked(listener: SandboxBlockListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    this.closeCount += 1;
    this.fence = { state: "stopped" };
  }
}

/** A sandbox that counts its opens and can hold one open until a test lets it go. */
export class FakeSandbox implements Sandbox {
  readonly opened: FakeSession[] = [];
  openCalls = 0;
  hold: Promise<void> | undefined;
  readonly openCalled = later();

  async check(): Promise<SandboxCheck> {
    return { ok: true, reason: null, missing: [] };
  }

  capabilities(): SandboxCapabilities {
    return { files: "shared", strength: "os" };
  }

  async open(profile: SandboxProfile): Promise<SandboxSession> {
    this.openCalls += 1;
    this.openCalled.settle();
    await this.hold;
    const session = new FakeSession(profile);
    this.opened.push(session);
    return session;
  }
}

/** A promise the test settles by hand. */
export function later(): { promise: Promise<void>; settle: () => void } {
  let settle: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}
