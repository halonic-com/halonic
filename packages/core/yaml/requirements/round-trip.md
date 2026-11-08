# yaml.round-trip

- Status: active
- Since: 0.1.0
- Source: HAL-111

When data is written with `writeYamlFile` and read back with `readYaml`, the layer shall return the same data, and writing it again shall give the identical text. Every example file of the old repo at `784f78d` shall read to the same data as the `yaml` library reads it.

## Examples

- Given each of the 20 `.yaml` files under `examples/` at `784f78d`, when `readYaml` runs, then the data equals `parse` from the `yaml` library.
- Given the data of each example file, when it is written, read and written again, then both texts are identical.
- Given the front matter of the example `SKILL.md`, when it is read and written with `writeFrontMatter`, then the text is unchanged.
- Given random plain data, when it is written and read back, then the data is unchanged, also with Windows line endings, and with a byte order mark before a top-level map.
