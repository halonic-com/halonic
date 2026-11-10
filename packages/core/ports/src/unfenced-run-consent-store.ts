/** Version of the {@link UnfencedRunConsentStore} port. A breaking change bumps it and comes with an ADR. */
export const unfencedRunConsentStoreVersion = 1;

/**
 * The user's yes to run plugin and integration code without the sandbox on
 * this computer (requirement `ports.unfenced-run-consent-store`). One yes
 * covers every plugin and integration, and holds only for the reason it was
 * given for.
 *
 * @example
 * const consent: UnfencedRunConsent = { reason: "windows", allowedAt: "2026-11-09T10:00:00.000Z" };
 */
export interface UnfencedRunConsent {
  /**
   * Why the code couldn't run in the sandbox when the user said yes, as the
   * fence status names it, such as `windows` or `container`.
   */
  reason: string;
  /** When the user said yes, as ISO text. Studio shows it ("You allowed … on 9 Nov"). */
  allowedAt: string;
}

/**
 * The user's one saved yes, in their profile on this computer: the profile
 * folder for the CLI and `serve`, the app data folder for the desktop app,
 * memory for tests. **Never in a workspace, a sheet, a setting or a config
 * file**, and there is no CLI flag for it, so neither a workspace nor an
 * agent can give it (I5 design 4.3.1).
 *
 * The port only stores the yes. `UnfencedRuns` in `core/app` decides from it
 * and the fence status whether code may start, and asks again when the
 * reason changes. Only Studio saves a yes, when the user ticks the trust
 * check's checkbox; no tool the model can call reaches this store.
 *
 * A yes that exists but can't be read makes `get` throw, never return
 * `null`; the caller then treats it as no yes. `remove` still deletes it.
 */
export interface UnfencedRunConsentStore {
  /** The saved yes, or `null` when there is none. */
  get(): Promise<UnfencedRunConsent | null>;
  /** Saves the yes, replacing any saved one. */
  save(consent: UnfencedRunConsent): Promise<void>;
  /** Deletes the yes, even one that can't be read. Removing none is not an error. */
  remove(): Promise<void>;
}
