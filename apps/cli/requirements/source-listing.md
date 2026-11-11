# cli.source-listing

- Status: active
- Since: 0.1.0
- Source: HAL-4846 (Liam's decision on HAL-2824: the CLI reads a source's tool listing outside a run, for `halonic tools`, HAL-2827); HAL-3070 (an untrusted workspace starts no connector, exit 3)

The CLI shall read a workspace source's tool listing outside a run through one set of connector factories, for `stdio` and `http`, built in its composition root. It shall check the workspace's trust first and, when the workspace isn't trusted as it is now, refuse with the trust check and exit code 3 before any program starts or any server is reached. A trusted source shall be connected with the workspace's grant, the command's secrets and the workspace folder, and closed once its tools are read. An `http` connector's address shall lead only to the class it is written as: a name to the internet, `localhost` to this computer, and an address written as numbers to its own class.

## Examples

- Given a trusted workspace whose source `notes` is a stdio program,
  when its listing is read,
  then the program starts once, lists its tools, and is stopped.
- Given the same workspace, not trusted,
  when its listing is read,
  then it fails with exit code 3 and no program has started.
- Given an `http` connector at `https://notes.acme.test/mcp`,
  when its address is checked,
  then it may lead only to the internet.
