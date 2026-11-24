# @halonicjs/testing-toolscript-fence

The fence and conformance suite every `ToolScriptIsolate` passes (ADR "Halonic ToolScript", the T4
fence list in section 6). It runs plain JavaScript straight in the isolate, with no static check, so
each fence holds on its own.

- **Layer:** testing
- **Owner:** mateo
- **Public API:** `@halonicjs/testing-toolscript-fence`

It covers the paths to the compiler and module imports, ambient globals, a fresh isolate per run, a
frozen `ctx`, plain-data arguments, secret handles, every limit of ADR 2.3, and the shape of a
result. The tests are behaviour only, so another host, such as the Cloudflare Dynamic Worker, runs the
same suite; a host that declares its own limits passes them as `declaredLimits`.

## Example

```ts
import { createQuickJsToolScriptIsolate } from "@halonicjs/adapter-toolscript-quickjs";
import { describeToolScriptIsolate } from "@halonicjs/testing-toolscript-fence";

describeToolScriptIsolate("QuickJS", () => createQuickJsToolScriptIsolate());
```
