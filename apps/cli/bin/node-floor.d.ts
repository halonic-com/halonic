/** The oldest Node.js halonic runs on, the same as `devEngines.runtime` in the root package.json. */
export declare const nodeFloor: { readonly major: number; readonly minor: number };

/** The lines to print when `version` is older than {@link nodeFloor}, or none when it is new enough. */
export declare function nodeTooOldLines(version: string): string[];
