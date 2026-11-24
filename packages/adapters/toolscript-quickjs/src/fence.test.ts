import { describeToolScriptIsolate } from "@halonicjs/testing-toolscript-fence";
import { createQuickJsToolScriptIsolate } from "./index.ts";

describeToolScriptIsolate("QuickJS", () => createQuickJsToolScriptIsolate());
