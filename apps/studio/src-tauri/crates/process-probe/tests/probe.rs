use halonic_process_probe::{host_name, process_alive};
use std::process::Command;

/// The id of a process that has exited and been waited for, so no process
/// has it until the system hands it out again.
fn exited_pid() -> u32 {
    // This test program lists its tests and exits, on every platform.
    let mut child = Command::new(std::env::current_exe().expect("test program path"))
        .arg("--list")
        .stdout(std::process::Stdio::null())
        .spawn()
        .expect("start a short-lived process");
    let pid = child.id();
    child.wait().expect("wait for it to exit");
    pid
}

#[test]
fn process_probe_finds_this_process() {
    assert!(process_alive(std::process::id()));
}

#[test]
fn process_probe_finds_no_process_that_has_exited() {
    assert!(!process_alive(exited_pid()));
}

#[test]
fn process_probe_counts_a_process_it_may_not_look_at_as_running() {
    // pid 1 (init) and pid 4 (System) belong to the system, not to us.
    let system_pid = if cfg!(windows) { 4 } else { 1 };
    assert!(process_alive(system_pid));
}

#[test]
fn process_probe_finds_no_process_for_ids_node_refuses() {
    assert!(!process_alive(0));
    assert!(!process_alive(i32::MAX as u32 + 1));
    assert!(!process_alive(u32::MAX));
}

#[test]
fn process_probe_names_this_computer() {
    let name = host_name().expect("a host name");
    assert!(!name.is_empty());
    assert!(!name.contains('\0'));
}

#[cfg(target_os = "linux")]
#[test]
fn process_probe_names_this_computer_as_the_kernel_does() {
    let kernel = std::fs::read_to_string("/proc/sys/kernel/hostname").expect("kernel host name");
    assert_eq!(host_name().as_deref(), Some(kernel.trim_end()));
}
