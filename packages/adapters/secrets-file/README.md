# @halonicjs/adapter-secrets-file

The `SecretStore` port over one JSON file in the profile. `halonic secret` writes the secrets here, and
`halonic serve` and the CLI read them back through `firstSecret(env, file)`, so an environment
variable always wins over the file.

- **Layer:** adapters
- **Owner:** elena
- **Runtime:** node
- **Public API:** `FileSecretStore`

## What to know before you use it

- **Values are stored unencrypted.** Only the file's permissions protect them. The folder is made
  private (`0700`) and the file is created readable by you alone (`0600`).
- **Linux and macOS** refuse to read a file that group or others can read, and say how to fix it
  (`chmod 600 <file>`). **Windows** has no such check: the profile folder's own permissions protect
  the file there.
- **A link is never followed.** A secrets file that is a link, or has a second name, is refused.
- **Last save wins.** There is no lock. Two programs that save at the same moment can lose one of the
  changes. Saves from one program run one after another. `halonic secret` is meant to be run by hand,
  one command at a time.
- **A value never appears in an error.** A damaged file is reported by its location and the fix,
  never by its content.
- A keychain store may come later. It would implement the same port, and the command wouldn't change.

## Example

```ts
import { FileSecretStore } from "@halonicjs/adapter-secrets-file";
import { secretsFile, profileFolder } from "@halonicjs/profile";

const store = new FileSecretStore(secretsFile(profileFolder(environment)));
await store.set("openai-key", value);
await store.names(); // ["openai-key"]
```
