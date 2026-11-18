# app.runner-unfenced-words

- Status: active
- Since: unreleased
- Source: HAL-3384; the "Runs" line design sections 2 and 11 (HAL-1873); microcopy 24.1 R3, approved on HAL-1949; HAL-3381 (Windows 11 keeps R3)

The runner-unfenced words shall give, for every reason plugin and integration code runs without the sandbox, one reason, one fix, a docs key and the docs link's name, under one catalogue key per reason, so the plugin trust check, the workspace trust check and the pages that ask for the yes read the same sentences. For `windows` the reason shall name whose code can't run ("plugin" or "integration") and the fix shall be WSL 2, on every Windows version. For `no-sandbox` the reason shall name the person's choice. Every other reason shall use the sandbox-start reason, fix and docs key word for word. A code Halonic doesn't know shall read as `other`. No word shall be "safe", "verified", "scanned", "secure", "protected" or "guaranteed".

## Examples

- Given `windows` and a plugin,
  then the reason is "On Windows, plugin code can't run in the sandbox in this version of Halonic." and the fix is "Use Halonic inside WSL 2 on this computer."
- Given `bubblewrap-missing`,
  then the reason and the fix are the sandbox-start words', and the docs link is "How to install bubblewrap".
- Given `no-sandbox`,
  then the reason says the person chose to use Halonic without a sandbox.
- Given every reason,
  then each has a reason, a fix and a docs link, and no two share a key.
- Given a code from a newer version,
  then the words are `other`'s.
