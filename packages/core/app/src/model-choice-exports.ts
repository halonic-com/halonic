// What the package exports for the first run's model choice, kept out of index.ts to keep that file short.

export {
  FirstRunModelChoice,
  type FirstRunModelChoiceParts,
  type ModelChoiceTrust,
} from "./first-run-model-choice.ts";
export { type SavedKeys, workspaceSavedKeys } from "./first-run-test-secrets.ts";
export {
  choiceModel,
  choiceProvider,
  type FirstRunKeyProvider,
  type FirstRunProvider,
  firstRunKeyProviders,
  firstRunLocalProvider,
  firstRunProviders,
  type KeyProblem,
  keyProblem,
  keyTestTimeLimitMs,
  localTestTimeLimitMs,
  type ModelChoice,
  testTimeLimitMs,
} from "./model-choice.ts";
export {
  type ChoiceChange,
  type ChoiceEdits,
  type ChoiceFiles,
  type ChoiceFileText,
  type ChoiceProblem,
  choiceEdits,
  firstRunAlias,
} from "./model-choice-edits.ts";
export {
  modelTestRequest,
  readTestReply,
  type TestOutcome,
  type TestResult,
  testOutcome,
  testReplyOptions,
} from "./model-choice-reply.ts";
export {
  ChoiceFilesNotCommitted,
  type ChoiceKey,
  choiceKey,
  type ModelChoiceFileReads,
  type ModelChoiceKeySave,
  type ModelChoiceLine,
  type ModelChoicePreview,
  type ModelChoiceSaved,
  type ModelChoiceService,
  type ModelChoiceTest,
} from "./model-choice-service.ts";
