# mutation.only-packages-with-code

- Status: active
- Since: 0.1.0
- Source: HAL-109

While a target package has no source file under `src` other than its tests and `src/index.ts`, the mutation runner shall skip it and report "no code yet" instead of running Stryker.

## Examples

- Given a package from `pnpm new` with only `src/index.ts` and `src/index.test.ts`,
  then it has no code to mutate.
- Given a package with `src/reader/scanner.ts`,
  then it has code to mutate.
- Given a package with only `src/index.ts` and `src/test/helpers.ts`,
  then it has no code to mutate.
- Given a package without a `src` folder, then it has no code to mutate.
