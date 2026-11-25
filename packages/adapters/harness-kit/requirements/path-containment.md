# harness-kit.path-containment

- Status: active
- Since: unreleased
- Source: HAL-18013, Liam's conditions on HAL-18023

The harness kit shall tell whether one absolute path is, or lies inside, another under the path rules it is given: `node:path` on the desktop and the POSIX rules of `@halonicjs/std` in a Cloudflare container. A path that only shares a prefix with a folder, such as `/a/bc` against `/a/b`, shall never count as inside it, under either rule set.

## Examples

- Given "/workspace/hubs" and "/workspace", when containment is checked under either rule set, then the first is inside the second.
- Given "/a/bc" and "/a/b", when containment is checked under either rule set, then the first isn't inside the second and the two don't overlap.
- Given "/workspace" twice, when containment is checked, then it is inside or the same, and not strictly inside.
