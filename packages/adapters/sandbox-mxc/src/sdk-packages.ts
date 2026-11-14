/** One npm package Halonic downloads for MXC's SDK, pinned to the bytes it was reviewed with. */
export interface SdkPackage {
  name: string;
  /** One exact version, never a range. */
  version: string;
  /** The `sha512-...` integrity npm publishes for the tarball (`npm view <name>@<version> dist.integrity`). */
  integrity: string;
  /** The processor this package is for (Node's `process.arch`); every processor when absent. */
  arch?: "x64" | "arm64";
}

/**
 * Everything MXC's SDK needs when the adapter uses `spawn` (HAL-7606, the
 * board's "yes, on demand"): the SDK and the two packages it loads at once,
 * `koffi` and `semver`, and koffi's compiled part for Windows on this processor. Not `node-pty`: the SDK loads it only for its
 * terminal path, which the adapter never takes. Bumping one entry runs the
 * MXC fence job, which fetches this same list.
 */
export const sdkPackages: readonly SdkPackage[] = [
  {
    name: "@microsoft/mxc-sdk",
    version: "1.0.1",
    integrity:
      "sha512-2cP925G5+lQyKzjBVha8uNtVd7XESgDBtgi1yCYYSo9M3xiFyZWtCO4SWPGTk509rdI6nqjyGcZxvEP3t6l8Hg==",
  },
  {
    name: "koffi",
    version: "3.3.8",
    integrity:
      "sha512-CTDlV3BDh8LFyCgv9vamD+5eu49HQ5wBetAJ9wxERAoAy6rfodahgo28tqhz010l2OGcZvrnBC6MOTyQUt4EIQ==",
  },
  {
    name: "semver",
    version: "7.8.6",
    integrity:
      "sha512-9lpSSU4Mly3mrtruwLs1eLK6+gzbzqeBFwRNjIjE+9LuDpWdYctrQlQ3ej1Ilgi7gknpsTRnPoLP8DpCHqHIJw==",
  },
  {
    name: "@koromix/koffi-win32-x64",
    version: "3.3.8",
    arch: "x64",
    integrity:
      "sha512-Ef9XpIn/AfnZWMI1lvA6IOjCsTVRlako+BXosp4cRaLZZXkgjwiBVqYXXhqZix1G8e+27UAv97XBTmDEyfS7jA==",
  },
  {
    name: "@koromix/koffi-win32-arm64",
    version: "3.3.8",
    arch: "arm64",
    integrity:
      "sha512-f43sCr9lxFIvkOEE0Br+Qr5+KH2XqRm/EAQgAflYprIsjCz4eBTPVwEjbuymyN/6iDEKyO7EDz/7xQgNiyvIyA==",
  },
];

/** What a computer with `arch` downloads: the packages for every processor and those for its own. */
export function sdkPackagesFor(arch: string): readonly SdkPackage[] {
  return sdkPackages.filter(
    (sdkPackage) => sdkPackage.arch === undefined || sdkPackage.arch === arch,
  );
}
