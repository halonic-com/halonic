# check.native-disabled

- Status: active
- Since: 0.1.0
- Source: HAL-3522

If a `.tsx` or `.jsx` file outside `packages/studio/kit/` that isn't a test gives a `<button>` element a native `disabled` attribute, then the `native-disabled` check shall fail, name the file and line, and say to use the kit's Button with `unavailable={{ reason }}` (component specs 23, A1).

## Examples

- Given `<button disabled>` in a feature's `.tsx` file, then the check fails on that line.
- Given `<button disabled={busy} />` in a shell `.jsx` file, then the check fails on that line.
- Given `<button disabled>` in a file under `packages/studio/kit/`, then the check passes.
- Given `<button disabled>` in a `.test.tsx` file, then the check passes.
- Given `<button aria-disabled="true">` or `<input disabled>`, then the check passes.
- Given the kit's `<Button unavailable={{ reason }}>`, then the check passes.
