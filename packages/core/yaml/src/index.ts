// The public API of @halonicjs/yaml. Everything else in src/ is internal.
export {
  editYaml,
  type YamlEdited,
  type YamlEditProblem,
  type YamlLayout,
} from "./edit.ts";
export type { YamlEdit } from "./edit-data.ts";
export type { SourcePosition, YamlProblem, YamlProblemKind } from "./problem.ts";
export {
  defaultYamlLimits,
  readYaml,
  type YamlFile,
  type YamlLimits,
  type YamlPath,
} from "./read.ts";
export { type FrontMatterFields, writeFrontMatter, writeYamlFile } from "./write.ts";
