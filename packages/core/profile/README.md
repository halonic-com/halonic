# @halonicjs/profile

Where Halonic keeps a person's files. `profileFolder` finds the profile folder, the same one for the
CLI and the Studio. Inside it, `workspaceFolders` gives each workspace one folder for its runs,
their blobs, its records and its changes to review, so nothing Halonic records ever lands in the workspace or its git repository
(HAL-2022 G4).

- **Layer:** core
- **Owner:** priya
- **Public API:** `@halonicjs/profile`

## Where the profile folder is

| System | Profile folder |
| --- | --- |
| any | `HALONIC_HOME`, when it is set (it must be absolute) |
| Windows | `%LOCALAPPDATA%\halonic`, or else `<home>\AppData\Local\halonic` |
| macOS | `~/Library/Application Support/halonic` |
| Linux | `$XDG_DATA_HOME/halonic`, or else `~/.local/share/halonic` |

An empty variable counts as unset, and a relative `XDG_DATA_HOME` or `LOCALAPPDATA` is ignored.
`profileFolder(environment)` takes a `ProfileEnvironment` (the system, the home folder and the
variables) and returns a `ProfileFolder`, the `root` path and the system it belongs to. It throws a
`RangeError` when `HALONIC_HOME` or the home folder isn't absolute.
`isAbsolutePath(platform, path)` is the check it uses, for a path on `"windows"`, `"macos"` or
`"linux"` (`ProfilePlatform`), whichever system the code runs on.

`trustFolder(profile)` names the `trust` folder in the profile folder, where the CLI and the
desktop shell both keep their trust records. The desktop shell's Rust port must give the same
answers for the cases in `src/golden/profile-folders.json`. `sandboxJournalFolder(profile)` names the
`sandbox-journals` folder in the profile folder, where the sandbox keeps its crash journals.
`pluginsFolder(profile)` and `pluginRecordsFolder(profile)` name the `plugins` and `plugin-records` folders
in the profile folder, where the CLI and the Studio share one plugin host's plugins and their records.
`withHomeAsTilde(platform, homeFolder, path)` writes a path inside the home folder with a leading `~`,
for showing to a person.

Inside the profile folder, each workspace has `workspaces/<key>/`, where `<key>` is the first 32 hex
characters of the SHA-256 of the workspace's real path. The key is internal: always ask
`workspaceFolders`, never build the path. `workspaceFolders` returns a `WorkspaceFolders`: `folder`,
the workspace's own folder, and a method for each folder in the table below. It throws a `RangeError` for a path that isn't
absolute. `runsFolder(deploymentId)` throws one for a deployment id that isn't 1 to 64 lowercase
letters, digits, `-` or `_` starting with a letter or digit, or that is a Windows device name
(`con`, `nul`, `com1`, …). `isDeploymentId` and `checkDeploymentId` apply the same rule for code that
hands a deployment id to something else that builds the folder, such as the desktop shell.

| Folder | Holds |
| --- | --- |
| `runs/` | the workspace's runs |
| `deployments/<id>/runs/` | one deployment's runs |
| `blobs/` | kept definitions and large run payloads |
| `records/` | agent notes and collection records |
| `review/` | the assistant's changes to review |

Records belong to the workspace: two workspaces with an agent `clerk` never share its notes, and a
moved workspace folder starts without its old records, as it does without its old runs. A person's
connection data (tokens, Google setups) is not a workspace's and is kept elsewhere in the profile.

The records of the assistant's changes to review hold each file's baseline, which decides what Try it
leaves out. They are kept here, like trust, and not in the workspace, so git can't bring one in and no
version, snapshot or Share carries one (HAL-3417).

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
