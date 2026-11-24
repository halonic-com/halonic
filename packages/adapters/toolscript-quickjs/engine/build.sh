#!/usr/bin/env bash
# Runs inside the pinned emsdk image, without network, from rebuild.sh: compiles
# the patched quickjs-ng amalgam and the wrapper's interface.c into
# out/quickjs.wasm and its glue out/quickjs.mjs. The flags are the wrapper's
# for its quickjs-ng release-sync variant (its Variant.mk at v0.32.0), except
# where a comment says otherwise.
set -euo pipefail

flags=(
  -Oz -flto --closure 1
  -DQTS_USE_QUICKJS_NG
  # Halonic: no build path or date in the output, so every build is the same bytes.
  -ffile-prefix-map=/src=.
  -s MODULARIZE=1 -s EXPORT_NAME=QuickJSRaw -s EXPORT_ES6=1 -s INVOKE_RUN=0
  # Halonic: the memory comes from the host, one per run, with
  # initial == maximum == MODULE_MEMORY_BYTES plus the run's memoryBytes, so
  # its own maximum is the hard limit. Growth stays allowed in the build:
  # without it the module would declare its maximum equal to its start and
  # link only to a memory of exactly that size. A grow past the given
  # memory's maximum fails, and malloc returns NULL.
  -s IMPORTED_MEMORY=1 -s ALLOW_MEMORY_GROWTH=1 -s "INITIAL_MEMORY=$MODULE_MEMORY_BYTES"
  # Halonic: 1 MiB of C stack instead of the wrapper's 5 MB. QuickJS's own
  # stack limit for a script (stackBytes) is 256 KiB, and this comes out of
  # the module's own memory above.
  -s "STACK_SIZE=$STACK_BYTES"
  # Halonic: said outright, since a trap here would end the run without
  # QuickJS's own out-of-memory error: when the memory can't grow, malloc
  # returns NULL instead of aborting the whole module.
  -s ABORTING_MALLOC=0
  -s ALLOW_TABLE_GROWTH=1
  -s SUPPORT_ERRNO=0
  -s FILESYSTEM=0
  -s IGNORE_MISSING_MAIN=0 --no-entry
  -s AUTO_JS_LIBRARIES=0 -lccall.js
  -s AUTO_NATIVE_LIBRARIES=0
  -s AUTO_ARCHIVE_INDEXES=0
  -s DEFAULT_TO_CXX=0
  -s ALLOW_UNIMPLEMENTED_SYSCALLS=0
  -s MIN_NODE_VERSION=160000
  -s NODEJS_CATCH_EXIT=0
  -s EXPORTED_RUNTIME_METHODS=@exported-runtime-methods.json
  --pre-js pre-extension.js
  --pre-js pre-wasm-memory.js
)

version=$(cat vendor/quickjs-ng/VERSION)
mkdir -p build out
emcc "${flags[@]}" -D_GNU_SOURCE -DQJS_BUILD_LIBC "-DCONFIG_VERSION=\"$version\"" \
  -c vendor/quickjs-ng/quickjs-amalgam.c -o build/quickjs-amalgam.o
emcc "${flags[@]}" -Wcast-function-type -c c/interface.c -o build/interface.o
emcc "${flags[@]}" -s EXPORTED_FUNCTIONS=@symbols.json \
  -o out/quickjs.mjs build/interface.o build/quickjs-amalgam.o
