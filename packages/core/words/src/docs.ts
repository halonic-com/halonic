/**
 * Where every docs link the CLI prints starts. 0.1.0 links docs.halonic.dev,
 * which answers today; docs.halonic.com has no DNS record until a release
 * puts it live, and then this is the one string to change (HAL-6561).
 */
export const docsBase = "https://docs.halonic.dev";

/** The sandbox's docs page, where `More:` under a sandbox that can't start points. */
export const sandboxDocs = `${docsBase}/security/sandbox/`;

/**
 * The section of {@link sandboxDocs} on a workspace on a Windows drive under
 * WSL, for `More:` under doctor's Workspace line (HAL-6552).
 */
export const wsl2FolderDocs = `${sandboxDocs}#wsl2-folder`;
