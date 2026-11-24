// The `@halonicjs/app/model-text` entry point: the text a model reads, with
// what a tool, a tool's result or a knowledge document says fenced as
// untrusted. It is its own entry point so the engine can reach it without the
// main one, which loads `yaml` and `@halonicjs/workspace` (HAL-16764).
export {
  knowledgeDocForModel,
  knowledgeHitForModel,
  maxKnowledgeRefLength,
} from "./knowledge-for-model.ts";
export {
  type FencedTextsRequest,
  fencedTextsNotice,
  toolForModel,
  toolResultForModel,
} from "./tool-for-model.ts";
export { fenceEnd, fenceStart, fenceUntrusted } from "./untrusted-fence.ts";
