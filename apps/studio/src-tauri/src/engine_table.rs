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

/// What the tray shows of every engine together (B1 step 5).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct EnginesSummary {
    /// The runs going now in every workspace, running or waiting.
    pub active_runs: u32,
    /// Whether the user paused routines from the tray.
    pub paused: bool,
    /// Whether a workspace is in the problem state.
    pub problem: bool,
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
    /// Crashed too often: left stopped until a window opens it again or
    /// the user picks Try again.
    problem: bool,
    /// When it last started, as a count: the highest is the newest.
    opened: u64,
}

/// The engines by the workspace's real path.
pub struct EngineTable<P> {
    workspaces: HashMap<PathBuf, Workspace<P>>,
    /// The sandbox host's latest handshake, `None` while none runs.
    host: Option<Handshake>,
    /// Set by Quit or an update's restart: no engine joins after it.
    closed: bool,
    /// The tray's Pause routines, for every workspace and the ones opened
    /// after it.
    pause_all: RoutinePause,
    /// The locations a start at login has yet to start or give up.
    waiting: Vec<String>,
    /// The latest workspace's `opened`.
    opened: u64,
}

impl<P> Default for EngineTable<P> {
    fn default() -> Self {
        Self {
            workspaces: HashMap::new(),
            host: None,
            closed: false,
            pause_all: RoutinePause::default(),
            waiting: Vec::new(),
            opened: 0,
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

    /// Notes a new launch for `workspace`, opened by `window`, or by a start
    /// at login when `None`. A window that opens a workspace in the problem
    /// state gets a fresh restart limit; the user's pause stays.
    ///
    /// Returns the launch's number, for [`Self::crashed`], or gives `engine`
    /// back to be stopped when Quit closed the table while it started.
    pub fn started(
        &mut self,
        workspace: PathBuf,
        location: String,
        engine: P,
        window: Option<&str>,
    ) -> Result<u64, P> {
        if self.closed {
            return Err(engine);
        }
        self.waiting.retain(|waiting| *waiting != location);
        self.opened += 1;
        let opened = self.opened;
        let pause = self.pause_all;
        let entry = self
            .workspaces
            .entry(workspace)
            .or_insert_with(|| Workspace {
                location: location.clone(),
                engine: None,
                launch: 0,
                windows: HashSet::new(),
                restarts: RestartLimit::default(),
                pause,
                problem: false,
                opened,
            });
        entry.opened = opened;
        entry.location = location;
        entry.engine = Some(engine);
        entry.launch += 1;
        entry.restarts = RestartLimit::default();
        entry.problem = false;
        if let Some(window) = window {
            entry.windows.insert(window.to_owned());
        }
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
        entry.problem = true;
        (engine, AfterCrash::Problem { windows })
    }

    /// The tray's Try again: takes every workspace out of the problem state
    /// with a fresh restart limit, and gives each back with its location, to
    /// start again as after a crash.
    pub fn try_again(&mut self) -> Vec<(PathBuf, String)> {
        self.workspaces
            .iter_mut()
            .filter(|(_, entry)| entry.problem)
            .map(|(workspace, entry)| {
                entry.problem = false;
                entry.restarts = RestartLimit::default();
                (workspace.clone(), entry.location.clone())
            })
            .collect()
    }

    /// Every engine together, for the tray. `active_runs` reads one
    /// engine's runs from its latest health.
    pub fn summary(&self, active_runs: impl Fn(&P) -> u32) -> EnginesSummary {
        let mut summary = EnginesSummary {
            paused: self.pause_all.is_paused(),
            ..EnginesSummary::default()
        };
        for entry in self.workspaces.values() {
            summary.problem |= entry.problem;
            if let Some(engine) = &entry.engine {
                summary.active_runs += active_runs(engine);
            }
        }
        summary
    }

    /// The tray's Pause routines or Resume routines: every workspace, and
    /// the ones opened after it, until the user resumes or quits. Gives back
    /// the pause and the running engines, to send it to.
    pub fn set_pause_all(&mut self, paused: bool) -> (RoutinePause, Vec<&P>) {
        let _frame = self.pause_all.set(paused);
        for entry in self.workspaces.values_mut() {
            let _frame = entry.pause.set(paused);
        }
        let engines = self.engines().collect();
        (self.pause_all, engines)
    }

    /// A restart of `workspace` didn't start: it is in the problem state,
    /// so the tray says so and offers Try again.
    pub fn failed_to_restart(&mut self, workspace: &Path) {
        if let Some(entry) = self.workspaces.get_mut(workspace) {
            entry.problem = true;
        }
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

    /// Pauses or resumes the routines of `workspace`, and gives back its
    /// running engine, if one runs, to send the new pause to. The pause
    /// stays through a crash and its restart, and until Quit; a workspace
    /// with no launch yet has nothing to keep it on.
    #[cfg_attr(
        not(test),
        expect(dead_code, reason = "the tray's Pause routines calls it (HAL-14206)")
    )]
    pub fn set_pause(&mut self, workspace: &Path, paused: bool) -> Option<&P> {
        let entry = self.workspaces.get_mut(workspace)?;
        // The frame goes through the engine's link, which writes it itself.
        let _frame = entry.pause.set(paused);
        entry.engine.as_ref()
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

    /// A start at login is about to start `locations`.
    pub fn waiting_to_start(&mut self, locations: &[String]) {
        self.waiting = locations.to_vec();
    }

    /// The start at login gave up `location`, or it started.
    pub fn not_waiting(&mut self, location: &str) {
        self.waiting.retain(|waiting| waiting != location);
    }

    /// The location of every workspace an engine was started for, running
    /// or in the problem state, and of those a start at login has yet to
    /// start, for the next start at login to start again
    /// (`studio.src-tauri.background-start`). At most `limit`, the newest
    /// first, the ones waiting counting as oldest, then sorted. `None` once
    /// Quit closed the table, so a second stop doesn't record an empty list
    /// over it.
    pub fn open_at_quit(&self, limit: usize) -> Option<Vec<String>> {
        if self.closed {
            return None;
        }
        let mut newest_first: Vec<&Workspace<P>> = self.workspaces.values().collect();
        newest_first.sort_by_key(|entry| std::cmp::Reverse(entry.opened));
        let mut seen = HashSet::new();
        let mut locations: Vec<String> = newest_first
            .into_iter()
            .map(|entry| &entry.location)
            .chain(&self.waiting)
            .filter(|location| seen.insert(*location))
            .take(limit)
            .cloned()
            .collect();
        locations.sort();
        Some(locations)
    }

    /// Quit: closes the table, so an engine still starting is given back by
    /// [`Self::started`] or [`Self::restarted`], forgets every workspace, and
    /// gives back the running engines, to stop outside any lock, with the
    /// windows each served.
    pub fn take_all(&mut self) -> Vec<(P, HashSet<String>)> {
        self.closed = true;
        self.waiting.clear();
        self.workspaces
            .drain()
            .filter_map(|(_, entry)| entry.engine.map(|engine| (engine, entry.windows)))
            .collect()
    }
}

#[cfg(test)]
#[path = "engine_table_tests.rs"]
mod tests;
