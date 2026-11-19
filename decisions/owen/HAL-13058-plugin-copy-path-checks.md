# Decision: a local tool's plugin copy is checked on, above and inside every path it must stay clear of

- Approval: Paperclip task HAL-13058; Liam approves this note in review
- Kind: internal

The place refused a plugin copy that was the working folder, inside it, or inside a denied path. It compared the paths as written. The sandbox's own tool folders already follow a stricter rule (`clearOfPaths` in `sandbox-srt`), and the place now follows the same one.

- The place refuses a plugin copy that is on, above or inside the working folder, the temp folder or any denied path. That includes `/` and a folder that holds a denied path.
- It compares each path as written and with links and junctions resolved, ignoring letter case and either slash, so a copy reached through a link is checked where it really is.
- The comparison is one shared function, `pathsOverlap` in `@halonicjs/adapter-system-node` (`system-node.path-overlap`), used by both the place and `sandbox-srt`. `sandbox-srt` behaves as before.

## Covers

- connector-stdio-sandbox.plugin-local-tool-place
