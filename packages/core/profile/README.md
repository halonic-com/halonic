# @halonicjs/profile

Where Halonic keeps a person's files. `profileFolder` finds the profile folder, the same one for the
CLI and the Studio. Inside it, `workspaceFolders` gives each workspace one folder for its runs and
their blobs, so nothing Halonic records ever lands in the workspace or its git repository
(HAL-2022 G4).

- **Layer:** core
- **Owner:** priya
- **Public API:** `@halonicjs/profile`

## Where the profile folder is

| System  | Profile folder                                             |
| ------- | ---------------------------------------------------------- |
| any     | `HALONIC_HOME`, when it is set (it must be absolute)       |
| Windows | `%LOCALAPPDATA%\halonic`                                   |
| macOS   | `~/Library/Application Support/halonic`                    |
| Linux   | `$XDG_DATA_HOME/halonic`, or else `~/.local/share/halonic` |

Inside it, each workspace has `workspaces/<key>/`, where `<key>` comes from a hash of the
workspace's real path. The key is internal: always ask `workspaceFolders`, never build the path.

| Folder                   | Holds                                   |
| ------------------------ | --------------------------------------- |
| `runs/`                  | the workspace's runs                    |
| `deployments/<id>/runs/` | one deployment's runs                   |
| `blobs/`                 | kept definitions and large run payloads |

The package only works out paths: it creates nothing and reads no files. The adapter gives it the
system, the home folder and the environment variables, and a `Digest` for the hash.

## Example: find the runs folder

The code lives in [`examples/find-the-runs-folder.ts`](examples/find-the-runs-folder.ts), where it
is typechecked and run by `src/example.test.ts`; keep this copy in step with it. The file imports
`../src/index.ts`, because a package may not import itself by name; outside this package, import
`@halonicjs/profile` as below.

```ts
import type { Digest } from "@halonicjs/ports";
import { profileFolder, workspaceFolders } from "@halonicjs/profile";

/** Finds where one workspace's runs, and one deployment's runs, are kept on a Linux machine. */
export async function runExample(
  digest: Digest,
): Promise<{ profile: string; runs: string; stagingRuns: string }> {
  // The adapter fills these in from the system: `process` in Node, a shell command in the Studio.
  const profile = profileFolder({
    platform: "linux",
    homeFolder: "/srv/acme",
    variables: { XDG_DATA_HOME: "/srv/acme/data" },
  });
  // Pass the workspace's real path, with every link resolved.
  const folders = await workspaceFolders(profile, "/srv/acme/workspace", digest);
  return {
    profile: profile.root, // "/srv/acme/data/halonic"
    runs: folders.runsFolder(), // ".../workspaces/<key>/runs"
    stagingRuns: folders.runsFolder("staging"), // ".../workspaces/<key>/deployments/staging/runs"
  };
}
```
