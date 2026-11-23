# agent-host.engine-role-arguments

- Status: draft
- Since: unreleased
- Source: HAL-17051; HAL-17004; design note D1 on HAL-14206

When the agent host is started with `--engine`, it shall run the engine role only when its command line is exactly `--engine`, `--profile-folder <folder>` and `--workspace <folder>`, in any order, with both folders absolute. If any other argument is given, an argument is repeated, a value is missing or a folder isn't absolute, then the agent host shall write why on standard error, open nothing and exit with code 2. The engine role shall take its profile folder only from `--profile-folder`, never from `HALONIC_HOME` or another environment variable, and shall read secrets and key origins only through the control pipe, keeping no value once a read has returned. Whether a provider's stored key may go to an address other than its default shall follow the workspace's trust as the engine read it when it opened; after a person changes the workspace's trust, Studio's shell shall stop the engine and start it again.

## Examples

- Given `--engine --workspace <workspace> --profile-folder <profile>`, both absolute,
  when the agent host reads its command line,
  then it runs the engine role on that workspace with that profile folder.
- Given `--engine --profile-folder <profile> --workspace acme`,
  when the agent host reads its command line,
  then it exits with code 2, as the workspace folder isn't absolute.
- Given `--engine --profile-folder <profile> --workspace <workspace> --stdio`,
  when the agent host reads its command line,
  then it exits with code 2 and opens nothing.
- Given a broker that holds `acme-key` as `sk-acme-1`,
  when the engine reads `acme-key` twice,
  then it asks the shell twice, as it kept nothing after the first read.
