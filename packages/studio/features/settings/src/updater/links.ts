/** Where Halonic's source and releases are; the same four links About Halonic shows. */
export const repository = "https://github.com/halonic-com/halonic";

/** The release page of one version, for "What's new" and "Open release page". */
export const releasePage = (version: string): string => `${repository}/releases/tag/v${version}`;
