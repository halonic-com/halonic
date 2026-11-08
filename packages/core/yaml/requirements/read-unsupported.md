# yaml.read-unsupported

- Status: active
- Since: 0.1.0
- Source: HAL-111

If the text uses an anchor, an alias, a tag, a second document or a list or map as a key, then `readYaml` shall fail with an `unsupported` problem that names the feature, says what to do instead, and points at the first such place in document order.

## Examples

- Given `base: &shared 1`, when `readYaml` runs, then the problem says "Anchors (&name) are not supported in workspace files. Write the value out in full." at line 1, column 15.
- Given `b: *shared` on line 2, when `readYaml` runs, then the problem is about aliases at line 2, column 4, and the alias is never resolved.
- Given `a: &x` with `  b: *x` under it, or `&l [ *l ]`, when `readYaml` runs, then it fails with an `unsupported` problem about the anchor (line 2, column 3 and line 1, column 4) and never returns circular data.
- Given `count: !!str 2` or `count: !custom 2`, when `readYaml` runs, then the problem is about tags.
- Given `a: 1`, then `---`, then `b: 2`, when `readYaml` runs, then the problem says "Workspace files hold one YAML document. Remove the second "---" or split the file." at line 2, column 1.
- Given `%YAML 1.2`, `---` and one document, when `readYaml` runs, then it reads normally.
- Given `? [a, b]` as a key, when `readYaml` runs, then the problem says lists and maps are not supported as keys.
