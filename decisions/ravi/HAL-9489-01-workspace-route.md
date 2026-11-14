# Decision: the session tells the served workspace's name and folder

- Task: HAL-9489
- Approval: Liam's decision on HAL-9482 (served Studio); Liam reviews the code and signs this note as the CTO
- Kind: internal

## What changes

The server gets a read-only route, `GET /api/workspace`, behind the sign-in. It tells the page the
name of the workspace the server runs, whether it is the sample, and the folder it is in. Nothing
the server answered before changes, and no rule is taken away.

- The host hands the server absolute facts through an optional `WorkspaceInfo` port, and the server
  shortens them: a folder under the person's home shows as `~/…`, any other folder shows only its
  own name. An absolute path never leaves the server.
- Without the port the route answers 404, so a host that has no workspace to tell loses nothing.
- `halonic serve` supplies the port. It reads the name at every request and resolves the home
  folder the same way as the workspace folder, so a link or a short Windows name can't hide that
  the workspace is under home. `sample` is always false until HAL-9089 decides how a sample is marked.

## Why

The Welcome page needs the workspace's name and place to show where it is. Having the host give
absolute facts and the server shorten them keeps one rule for every host, the cloud Worker included,
and keeps the person's folder layout off the wire.

## Covers

- cli.commands.serve.serve
- server.api
