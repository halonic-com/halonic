# halonic-resource-probe

Reads the numbers behind the status bar's resources item (HAL-11118): `process_memory_bytes`, `free_disk_bytes` and `folder_size_bytes`.

- **Memory** is this process only, the part held in RAM: `/proc/self/statm` on Linux and Android, the Mach task's resident size on macOS, the working set (`GetProcessMemoryInfo`) on Windows. The engine runs in the web view's process, not in this one, so the number is a lower bound.
- **Free disk space** is what the person may use (`statvfs`'s `f_bavail`, `GetDiskFreeSpaceExW`'s first number), on the drive of a folder. A folder that doesn't exist yet is read through the nearest folder above it that does.
- **Folder size** uses the standard library only. It never follows a symbolic link.

## Why this crate allows `unsafe`

The standard library can't read free space or a process's memory, and the workspace forbids `unsafe` code. Liam approved one more exception on HAL-11121, on the pattern of [`process-probe`](../process-probe): this crate turns the lint off in its own `Cargo.toml`, each `unsafe` block has a `// SAFETY:` comment (`undocumented_unsafe_blocks` is denied), and the API is three safe functions.

`libc` and `windows-sys` are the versions already in `Cargo.lock`. Two `windows-sys` features are new for this crate (`Win32_Storage_FileSystem`, `Win32_System_ProcessStatus`), approved on HAL-11121.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, `resource_probe_`.
