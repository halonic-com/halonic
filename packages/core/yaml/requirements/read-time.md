# yaml.read-time

- Status: active
- Since: unreleased
- Source: HAL-16339

The `readYaml` reader shall find a key that is in its map twice, in a block or flow map at any depth, in time linear in the map's size, and fail with the `syntax` problem `Map keys must be unique` at the second key, as the `yaml` library words it. Keys are the same when their values are, as the library reads them: `~` and `null` are the same key, `1` and `"1"` are not. `editYaml` shall not take quadratic time on a long run of blanks after a key.

## Examples

- Given a map with 60,000 different keys, just under the length limit, when `readYaml` runs, then it reads all of them.
- Given `a: { b: 1, c: 2, b: 3 }` on line 1, when `readYaml` runs, then the problem is at line 1, column 18.
- Given `~: 1` and then `null: 2`, when `readYaml` runs, then the problem is at line 2, column 1.
- Given a line of 200,000 blanks and `x`, when `editYaml` looks for a comment on it to keep, then it finds none, at once.
