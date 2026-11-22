import { defaultLocalAddress } from "@halonicjs/adapter-workspace-models";
import type { Provider } from "@halonicjs/format";

/**
 * A provider's host and port, as the CLI's failure lines name it: the host of `baseUrl`, never its
 * path, or else the default address of a model server on this computer.
 */
export function providerHost(provider: Provider): string | undefined {
  if (provider.baseUrl !== undefined) {
    return URL.canParse(provider.baseUrl) ? new URL(provider.baseUrl).host : undefined;
  }
  return defaultLocalAddress(provider.type);
}
