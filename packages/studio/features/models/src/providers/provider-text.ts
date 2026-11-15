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
export const DEFAULT_BASE_URL = "The provider's own";
export const NO_SECRET = "none";

/** The title of a provider's tab and page. */
export function providerTitle(name: string): string {
  return `Provider: ${name}`;
}

/** The status line after a provider field is saved, and the name of its undo step. */
export function providerUpdatedLine(name: string): string {
  return `Updated provider ${name}`;
}
