//! The agent host's life outside a single call: whether it answers, ending
//! a page's streams when the page reloads or closes, and stopping the host
//! itself before the updater's installer replaces it.

use tauri::{AppHandle, Manager, Runtime};

use super::choice::HostKind;
use super::start::{chosen_host, local_host_starts};
use super::{AgentHostState, running_host};

/// Ends every stream of the page `page`. The shell calls this when that
/// page starts loading another document, or its window closes.
pub fn end_page_streams<R: Runtime>(app: &AppHandle<R>, page: &str) {
    if let Some(state) = app.try_state::<AgentHostState>() {
        state.streams.end(|key| key.page == page);
    }
}

/// Stops the host, and the messaging host beside the shell where one runs,
/// as dropping them does, before the updater's installer replaces their
/// file: the updater ends the shell with `exit`, which drops nothing
/// (HAL-1206). The background engines stop first, as Quit stops
/// them, since their harness steps use the host.
pub fn stop_host<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(desktop)]
    crate::engines::stop_all(app);
    let Some(state) = app.try_state::<AgentHostState>() else {
        return;
    };
    let host = state.host.lock().ok().and_then(|mut host| host.take());
    drop(host);
    let messaging = state
        .messaging_host
        .lock()
        .ok()
        .and_then(|mut host| host.take());
    drop(messaging);
}

/// Starts the host once the WSL setup is done (HAL-16765). It refused to
/// start while the distro was missing; starting it now installs the runtime
/// beside the shell into the new distro, as every start in the distro does.
/// A host that already runs is left as it is, with its sessions. On a
/// refusal, answers its sandbox reason, if it gave one, and its message.
#[cfg(windows)]
pub async fn start_host_after_setup<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(), (Option<&'static str>, String)> {
    running_host(app)
        .await
        .map(drop)
        .map_err(|refusal| (refusal.reason, refusal.message))
}

/// Whether the host starts, or runs, and answers its handshake: part of the
/// proof that a newly installed version works (HAL-1206). A refusal that
/// names a sandbox reason (no WSL, no distro yet) counts too: the shell
/// works and says what is left to set up, and a PC without the distro must
/// still be able to prove an update. It counts only when the host file
/// beside the shell starts and answers, so a broken host never passes.
///
/// Where the choice asks for the host in the distro, the host beside the
/// shell is the proof straight away: starting the distro's host first
/// cleans mounts and installs the runtime and security updates, which can
/// take longer than the installer waits before it goes back, and a
/// `wsl.exe` that fails names no sandbox reason.
pub async fn host_answers<R: Runtime>(app: &AppHandle<R>) -> bool {
    let chosen = chosen_host(app).ok().map(|(kind, _)| kind);
    if proves_beside_shell(chosen) {
        return local_host_starts(app).await;
    }
    match running_host(app).await {
        Ok(_) => true,
        Err(refusal) => refusal.reason.is_some() && local_host_starts(app).await,
    }
}

/// Whether an update proves itself with the host beside the shell rather
/// than the host the choice starts: only for the host in the distro. The
/// local host is proved by starting it, as it then keeps running.
fn proves_beside_shell(chosen: Option<HostKind>) -> bool {
    chosen == Some(HostKind::Distro)
}

#[cfg(test)]
mod tests {
    use super::super::choice::HostKind;
    use super::proves_beside_shell;

    /// Failure path 2 (HAL-1206): an update on a PC whose choice is the host
    /// in the distro proves itself with the host beside the shell, so a slow
    /// first start in the distro doesn't send it back.
    #[test]
    fn update_proof_uses_the_host_beside_the_shell_for_the_distro_choice() {
        assert!(proves_beside_shell(Some(HostKind::Distro)));
        assert!(!proves_beside_shell(Some(HostKind::Local)));
        assert!(!proves_beside_shell(None));
    }
}
