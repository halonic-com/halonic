//! The shell's background engines, one per workspace (design note D10), as
//! plain data: which windows each serves, which launch is current, and
//! whether a crashed one may start again, and where the sandbox host is, so
//! an engine joins the table and hears the host under one lock. `engines.rs`
//! starts and stops the processes; this file holds no Tauri types, so tests
//! drive it with a stand-in engine.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Instant;

use halonic_agent_host::Handshake;
use halonic_engine_pipe::RoutinePause;
use halonic_engine_supervisor::RestartLimit;

/// What a crashed engine's workspace does next.
#[derive(Debug, PartialEq, Eq)]
pub enum AfterCrash {
    /// Not the current launch (it was stopped, or started again since):
    /// nothing to do.
    Stale,
    /// Start it again for `location`, then reconnect `windows`.
    Restart {
        location: String,
        windows: HashSet<String>,
    },
    /// Too many restarts: the workspace is in the problem state until a
    /// window opens it again. `windows` lost their engine.
    Problem { windows: HashSet<String> },
}

struct Workspace<P> {
    location: String,
    /// `None` between a crash and the restart, and in the problem state.
    engine: Option<P>,
    /// Counts launches, so a late word about an old one is recognised.
    launch: u64,
    windows: HashSet<String>,
    restarts: RestartLimit,
    pause: RoutinePause,
}

/// The engines by the workspace's real path.
pub struct EngineTable<P> {
    workspaces: HashMap<PathBuf, Workspace<P>>,
    /// The sandbox host's latest handshake, `None` while none runs.
    host: Option<Handshake>,
    /// Set by Quit or an update's restart: no engine joins after it.
    closed: bool,
}

impl<P> Default for EngineTable<P> {
    fn default() -> Self {
        Self {
            workspaces: HashMap::new(),
            host: None,
            closed: false,
        }
    }
}

impl<P> EngineTable<P> {
    /// The running engine of `workspace`, which now also serves `window`.
    pub fn serve(&mut self, workspace: &Path, window: &str) -> Option<&P> {
        let entry = self.workspaces.get_mut(workspace)?;
        let engine = entry.engine.as_ref()?;
        entry.windows.insert(window.to_owned());
        Some(engine)
    }

    /// Notes a new launch for `workspace`, opened by `window`. A window that
    /// opens a workspace in the problem state gets a fresh restart limit;
    /// the user's pause stays.
    ///
    /// Returns the launch's number, for [`Self::crashed`], or gives `engine`
    /// back to be stopped when Quit closed the table while it started.
    pub fn started(
        &mut self,
        workspace: PathBuf,
        location: String,
        engine: P,
        window: &str,
    ) -> Result<u64, P> {
        if self.closed {
            return Err(engine);
        }
        let entry = self
            .workspaces
            .entry(workspace)
            .or_insert_with(|| Workspace {
                location: location.clone(),
                engine: None,
                launch: 0,
                windows: HashSet::new(),
                restarts: RestartLimit::default(),
                pause: RoutinePause::default(),
            });
        entry.location = location;
        entry.engine = Some(engine);
        entry.launch += 1;
        entry.restarts = RestartLimit::default();
        entry.windows.insert(window.to_owned());
        Ok(entry.launch)
    }

    /// Notes that launch `launch` of `workspace` ended without the shell
    /// stopping it, at `now`. Gives back its engine, to drop outside any
    /// lock, and what to do next.
    pub fn crashed(
        &mut self,
        workspace: &Path,
        launch: u64,
        now: Instant,
    ) -> (Option<P>, AfterCrash) {
        let Some(entry) = self.workspaces.get_mut(workspace) else {
            return (None, AfterCrash::Stale);
        };
        if entry.launch != launch || entry.engine.is_none() {
            return (None, AfterCrash::Stale);
        }
        let engine = entry.engine.take();
        let windows = entry.windows.clone();
        if entry.restarts.may_restart(now) {
            let location = entry.location.clone();
            return (engine, AfterCrash::Restart { location, windows });
        }
        (engine, AfterCrash::Problem { windows })
    }

    /// Notes a restart's launch, which keeps the restart limit.
    ///
    /// Returns its number and the windows to connect, or gives `engine`
    /// back when the workspace was stopped meanwhile: then the caller stops
    /// it.
    pub fn restarted(&mut self, workspace: &Path, engine: P) -> Result<(u64, HashSet<String>), P> {
        let Some(entry) = self.workspaces.get_mut(workspace) else {
            return Err(engine);
        };
        entry.engine = Some(engine);
        entry.launch += 1;
        Ok((entry.launch, entry.windows.clone()))
    }

    /// The number of the latest launch of `workspace`, 0 before the first.
    pub fn launch(&self, workspace: &Path) -> u64 {
        self.workspaces
            .get(workspace)
            .map_or(0, |entry| entry.launch)
    }

    /// The running engine of `workspace`, without serving a window.
    pub fn engine(&self, workspace: &Path) -> Option<&P> {
        self.workspaces.get(workspace)?.engine.as_ref()
    }

    /// The sandbox host's latest handshake, to send after a handshake.
    pub fn host(&self) -> Option<&Handshake> {
        self.host.as_ref()
    }

    /// Notes where the sandbox host is now, or that none runs.
    pub fn set_host(&mut self, host: Option<Handshake>) {
        self.host = host;
    }

    /// The user's Pause routines for `workspace`, to send after a handshake.
    pub fn pause(&self, workspace: &Path) -> RoutinePause {
        self.workspaces
            .get(workspace)
            .map(|entry| entry.pause)
            .unwrap_or_default()
    }

    /// `window` closed: no engine serves it now. Engines keep running.
    pub fn close_window(&mut self, window: &str) {
        for entry in self.workspaces.values_mut() {
            entry.windows.remove(window);
        }
    }

    /// Every running engine, to tell each the same thing.
    pub fn engines(&self) -> impl Iterator<Item = &P> {
        self.workspaces
            .values()
            .filter_map(|entry| entry.engine.as_ref())
    }

    /// Quit: closes the table, so an engine still starting is given back by
    /// [`Self::started`] or [`Self::restarted`], forgets every workspace, and
    /// gives back the running engines, to stop outside any lock, with the
    /// windows each served.
    pub fn take_all(&mut self) -> Vec<(P, HashSet<String>)> {
        self.closed = true;
        self.workspaces
            .drain()
            .filter_map(|(_, entry)| entry.engine.map(|engine| (engine, entry.windows)))
            .collect()
    }
}

#[cfg(test)]
#[path = "engine_table_tests.rs"]
mod tests;
