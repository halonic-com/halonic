/** The words of the Providers list and the provider page (microcopy 6.2; flow-models 3.1 and 3.2). */
export const PROVIDERS_HEADING = "Providers";
export const NO_PROVIDERS_LINE =
  "No providers yet. A provider is the company or local server that runs your models, like Anthropic or Ollama.";
export const PROVIDERS_LOADING_LINE = "Loading providers";
export const PROVIDER_KIND = "model-provider";
export const PROVIDER_KIND_LABEL = "Model provider";

/** The warning on a cloud provider's page when the workspace is local only. */
export function blockedLocalOnlyLine(workspaceName: string | undefined): string {
  return `${workspaceName ?? "This workspace"} is local only, so it can't use this provider.`;
}
export const PROVIDER_GONE_LINE = "This provider is no longer in providers/.";
/** The Base URL box's placeholder: what an empty box means. */
export const DEFAULT_BASE_URL = "The provider's own";

/** The adapter types a provider can have, for the Type list. Keep in step with the provider type enum in `@halonicjs/format` (`kinds/provider/schema.ts`). */
export const PROVIDER_TYPES = [
  "anthropic",
  "openai",
  "openai-compatible",
  "ollama",
  "lmstudio",
] as const;
export const NO_SECRET = "none";

/** The caption over a provider page's title, set in capitals. */
export const PROVIDER_CAPTION = "Provider";
export const PROVIDERS_UNREADABLE_TITLE = "Couldn't load providers";
export const PROVIDERS_UNREADABLE_REASON = "Halonic couldn't read the providers folder.";
export const PROVIDER_FILE_UNREADABLE_TITLE = "Couldn't read this provider's file";
export { TRY_AGAIN } from "../aliases/alias-text.ts";
export const LOCAL_SWITCH_LABEL = "This computer or your own network";

/** What a provider page says when its file doesn't parse, naming the file. */
export function providerFileUnreadableLine(path: string): string {
  return `Halonic couldn't read ${path}. Fix the file, then try again.`;
}

/** The line over the file names in the Providers list when some provider files don't parse. */
export const PROVIDER_FILES_SKIPPED_LINE = "Halonic couldn't read these provider files:";

/** The title of a provider's tab: its id with a capital, since the tab has no file to read. */
export function providerTabLabel(id: string): string {
  return `${id.charAt(0).toUpperCase()}${id.slice(1)}`;
}

/** The status line after a provider field is saved, and the name of its undo step. */
export function providerUpdatedLine(name: string): string {
  return `Updated provider ${name}`;
}
