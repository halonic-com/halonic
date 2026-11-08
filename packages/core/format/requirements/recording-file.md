# format.recording-file

- Status: active
- Since: 0.1.0
- Source: HAL-143, `tooling/record/src/format.ts` in halonic-com/integrations at 155685c; export decision on HAL-884

The `@halonicjs/format/recording` entry point shall offer `RECORDING_FORMAT`, `recordingFileSchema`, `RecordingFile` and `formatRecording` exactly as the recorder defines `halonic.recording/1`, import only schema-kit (never `yaml`), and not be re-exported from `@halonicjs/format`, so the recorder and the conformance suite share one reader without loading the YAML parser.

## Examples

- Given each of the five sample recordings from the integrations repo, when it is parsed and written with `formatRecording`, then it passes and the text is the same byte for byte.
- Given a recording with a `form` body, when it is parsed, then it passes.
- Given `format: halonic.recording/2`, an unknown key, an upper-case header name, a lower-case method, a `file:` URL, a status of 99, an unknown body kind or transport, or a scrub count of 0, when it is parsed, then it fails at that value.
- Given a recording, when it is written with `formatRecording`, then keys are sorted at every level, lists keep their order and the text ends with a line break.
- Given the imports of `src/recording/index.ts`, followed through every relative file, then the only package is `@halonicjs/schema-kit` and `parse-file.ts` is not among them.
