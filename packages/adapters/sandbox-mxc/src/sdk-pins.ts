/** One npm package the SDK download fetches, pinned to the exact bytes we reviewed. */
export interface PinnedPackage {
  /** The package name, such as `@microsoft/mxc-sdk`. */
  name: string;
  version: string;
  /** Where the tarball is. Only https on `registry.npmjs.org` is ever fetched. */
  tarballUrl: string;
  /** The tarball's npm `dist.integrity`: `sha512-` and the base64 of its SHA-512. */
  integrity: string;
}

/**
 * MXC's SDK and the two packages it needs on Windows (HAL-7606, HAL-7607).
 * `node-pty` is left out on purpose: the adapter never starts a terminal.
 * `koffi` and `semver` are the versions `@microsoft/mxc-sdk@1.0.1` resolves to
 * for its ranges (`^3.2.1`, `^7.7.4`) on 2026-11-14.
 */
export const mxcSdkPins: readonly PinnedPackage[] = [
  {
    name: "@microsoft/mxc-sdk",
    version: "1.0.1",
    tarballUrl: "https://registry.npmjs.org/@microsoft/mxc-sdk/-/mxc-sdk-1.0.1.tgz",
    integrity:
      "sha512-2cP925G5+lQyKzjBVha8uNtVd7XESgDBtgi1yCYYSo9M3xiFyZWtCO4SWPGTk509rdI6nqjyGcZxvEP3t6l8Hg==",
  },
  {
    name: "koffi",
    version: "3.3.8",
    tarballUrl: "https://registry.npmjs.org/koffi/-/koffi-3.3.8.tgz",
    integrity:
      "sha512-CTDlV3BDh8LFyCgv9vamD+5eu49HQ5wBetAJ9wxERAoAy6rfodahgo28tqhz010l2OGcZvrnBC6MOTyQUt4EIQ==",
  },
  {
    name: "semver",
    version: "7.8.6",
    tarballUrl: "https://registry.npmjs.org/semver/-/semver-7.8.6.tgz",
    integrity:
      "sha512-9lpSSU4Mly3mrtruwLs1eLK6+gzbzqeBFwRNjIjE+9LuDpWdYctrQlQ3ej1Ilgi7gknpsTRnPoLP8DpCHqHIJw==",
  },
];
