// The public API of @halonicjs/format/recording. It must not import `yaml`,
// even indirectly; recording.test.ts checks that. `.` doesn't re-export it.

export {
  formatRecording,
  RECORDING_FORMAT,
  type RecordingFile,
  recordingFileSchema,
} from "./format.ts";
