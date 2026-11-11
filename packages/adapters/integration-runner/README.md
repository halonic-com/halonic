# @halonicjs/adapter-integration-runner

The bridge between Halonic and the runner: a separate Node process that holds one local integration inside the fence. Both sides speak a strict message protocol over the runner's stdin and stdout (design HAL-958, section 3).

- **Layer:** adapters
- **Owner:** ravi
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-integration-runner`

This package is built in steps (HAL-983). So far it has the protocol on both sides:

- **Frames:** one JSON frame per line, at most 1 MiB (`maxFrameBytes`) with its newline. Bytes
  travel as base64.
- **Halonic's side, `connectRunner`:** it takes a runner that has already been started, as a `SandboxProcess`. It waits for
  `ready` with this start's nonce, sends `start` with the settings and tool names, and waits for
  `declared`: the name, version and tools the integration's code declares (10 seconds for both,
  `readyTimeoutMs`). It returns a `RunnerConnection`: an `IntegrationConnection` with
  `declaration`, frozen plain data the caller checks against the permission sheet, and `stopped`,
  a promise that settles with the reason the runner ended. Each request the runner asks for goes through the kit's client for
  this integration, and a body is read one piece per `pull`.
  - Anything outside the protocol stops the runner and is reported through `onBlocked`. A kit
    refusal on the kit's leak list is reported there too.
  - Every request gets an answer. A refusal too large for a frame is replaced by a short fixed
    message, and a request or body piece Halonic cannot answer stops the runner (`protocol`)
    rather than leaving it waiting.
  - Tool results, tool errors and stderr pass through the kit's secret filter.
- **The limits** (`defaultRunnerLimits`):
  - at most 8 requests in flight;
  - a request's URL, headers and secret placements together at most 32 KiB, each header and
    placement counting 4 bytes more, with at most 100 headers and 16 placements;
  - a request belongs to its call: when the call answers, is cancelled or fails, Halonic aborts
    its kit request, drops its body and frees its slot;
  - the runner is stopped once it leaves more than 8 MiB of its stdin unread;
  - a call is cancelled when its signal aborts or after 5 minutes, and the runner is stopped if it
    hasn't answered 5 seconds later;
  - between calls, a `ping` every 5 seconds that must be answered within 1 second;
  - the runner is stopped after 2 minutes without a call;
  - stderr is cut at 1 MiB per call.
- **The runner's side, `serveRunner`:** it gives the integration `http`, `settings` and `wait`,
  but no `tokens`. `http` sends each request as a frame. A body the kit would refuse is refused
  before it crosses, and so is a request made outside a tool call.

The tests include attack cases: a runner that sends malformed, oversize or out-of-order frames
must be stopped with exactly one block, or answered without stopping, and never make Halonic throw.

- **Starting it, `startRunner`:** it opens a `Sandbox` session of the runner's own with the
  untrusted profile (`runnerProfile`), starts Node in it and connects. The profile has no network
  and no loopback bridge, writes only to a fresh temp folder, and an environment of `TMPDIR`
  alone. It hides the home folder and the socket folders (`socketFolders`). A profile can't allow
  a path inside a hidden one, so when Node or the integration is inside such a folder, every other
  entry on the way is hidden instead. The fence denies a path's real place too, so every path is
  resolved first (`realRunnerPaths`), and a symlink into what the runner needs, such as
  `~/.nvm/current`, is left unhidden. Node runs with `--permission`, reading only the runner and
  the integration's folder. Each start has a fresh nonce. The connection carries the session's
  fence proof (`fence`), what the fence refuses is reported through `onBlocked` as a `fence`
  block, and the session closes when the runner stops for any reason.
- **The runner process, `src/runner/main.ts`:** `node --permission … <runner> <nonce> <folder>
  <entry file> <export>`. The console goes to stderr, so stdout carries only frames. It loads the
  integration after `start`, sends its declaration with only the fields the protocol knows, and
  gives it a token store that refuses every call.
- **The module hook, `src/runner/module-fence.ts`:** before the integration loads, the runner
  registers a hook that lets an import or require through only when it names a file, or `zod`,
  and resolves to a file inside the integration's folder. Node's own modules by any name
  (`node:fs`, `fs`, `node:module`), `data:` and `blob:` URLs, other packages and `../` out of
  the folder are refused, and `process.getBuiltinModule` is removed (attack case A34). It holds
  with Node's permission layer off too, for imports and requires, and refuses native add-ons
  (`.node`). `zod` must resolve inside the folder.
- **The runner file, `pnpm build` (`esbuild.config.ts`):** writes the runner and everything it
  imports (our packages and Zod) to `dist/runner.mjs`, the one file Node may read inside the fence
  besides the integration's folder. The build fails if that file would import anything but Node's
  own modules. esbuild does the build and never ships.

- **Starting it without the fence:** `startRunner` also takes the launcher's `Sandbox`
  (`sandbox-host`) for the path the user confirmed without the fence. The start is the same:
  the untrusted profile, Node with `--permission` reading only the runner and the integration's
  folder, and a fresh nonce. Node's permission model is then the only layer, so `fence` is
  `{ state: "off" }`, never `fenced` (requirement `integration-runner.start-without-fence`).
- **Loading a local integration, `loadLocalIntegration`:** every local integration runs in the
  runner; built-in ones keep loading in-process with the kit's `loadIntegration`. The kit checks
  the sheet and the workspace's choices without the code (`prepareIntegration`, which also refuses
  a sheet with `tokens`). Then `folderLinkProblems` refuses a folder with a symbolic link that
  leads out of it or nowhere, or a file hard-linked to a name outside it (A12, HAL-4965). It reads
  at most `maxFolderEntries` (10,000) entries and refuses a larger folder. Only then does the
  caller's `start` run: the trust check, the start gate in `core/app`, then `startRunner`. The
  runner's declaration must match the sheet, or it is stopped and nothing is offered. After an
  idle stop the next call checks the folder's links again and starts a new runner the same way,
  which must declare the same; a call that got a runner just as it stopped for being idle is made
  once more on the new one. After any other stop, or a refused restart, nothing starts again and
  every call fails with that reason. A closed connection refuses calls.

Whether a runner may start at all, and fenced or not, is decided before `startRunner` by the start
gate in `core/app`.

## Example

```ts
import { connectRunner, socketFolders, startRunner } from "@halonicjs/adapter-integration-runner";

const connection = await connectRunner({
  process, // started through the Sandbox session
  nonce, // fresh for this start
  settings: { baseUrl: "https://api.example.com" },
  tools: ["forecast"],
  http: host.http, // the kit's client for this integration
  secrets, // secretForms(...) of this integration's secrets
  onBlocked: (block) => pauseConnector(block),
});
const text = await connection.callTool("forecast", { city: "Ghent" }, signal);

// Or start it through a Sandbox session and connect in one step:
const runner = await startRunner({
  sandbox, // sandbox-srt
  files: { node, nodeFolder, runnerFile, integrationFolder },
  entry: { file: `${integrationFolder}/index.js`, exportName: "weather" },
  machine: { homeFolder, socketFolders: socketFolders(env), tempFolder, timeLimitMs },
  settings,
  tools,
  http,
  secrets,
  onBlocked,
});
runner.fence; // { state: "fenced" }, or { state: "off" } through sandbox-host
```
