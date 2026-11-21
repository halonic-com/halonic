// The failures a run stops on when the model check wouldn't send a provider's
// key where its file points, or wouldn't call a real model at all
// (requirement `cli.workspace-provider-key-trust`, HAL-15333). The engine
// names each in its cause (`models.<code>`); these read the facts from the
// cause's detail. The key is named, never its value.

/** A refused key or provider, by the reason its lines name, with the facts they need. */
export type KeyAddressFailure =
  | {
      /** The key has a list of allowed addresses, and the provider's address isn't on it. */
      readonly reason: "key-address-not-allowed";
      /** The provider's id, such as "gateway". */
      readonly provider: string;
      /** The stored key's name, such as `gw-key`. */
      readonly key: string;
      /** The address the key would have gone to, as scheme, host and port, such as `https://other.example.com`. */
      readonly address: string;
    }
  | {
      /** The key would go to an address other than its type's own, and the workspace isn't trusted here. */
      readonly reason: "key-address-not-trusted";
      readonly provider: string;
      readonly address: string;
    }
  | {
      /** The provider calls a real model, and the workspace isn't trusted here. */
      readonly reason: "workspace-not-trusted";
      readonly provider: string;
    };

/**
 * The failure a cause names by its code, or `undefined` for a code that
 * isn't one, or a cause without the names its facts need.
 */
export function keyAddressFailureOf(
  code: string | undefined,
  detail: Readonly<Record<string, string>>,
): KeyAddressFailure | undefined {
  const { provider, key, origin } = detail;
  if (provider === undefined) return undefined;
  switch (code) {
    case "models.key-origin-not-allowed":
      return key === undefined || origin === undefined
        ? undefined
        : { reason: "key-address-not-allowed", provider, key, address: origin };
    case "models.untrusted-provider-address":
      return origin === undefined
        ? undefined
        : { reason: "key-address-not-trusted", provider, address: origin };
    case "models.untrusted-workspace":
      return { reason: "workspace-not-trusted", provider };
    default:
      return undefined;
  }
}
