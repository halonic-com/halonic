use std::time::{Duration, Instant};

use halonic_agent_host::{Handshake, read_handshake};
use halonic_secret_broker::BrokerRequest;

use crate::fault::PipeFault;
use crate::messages::{EngineFrame, PROTOCOL_VERSION, is_iso_instant, parse_frame};

/// The shortest time between two `health` frames the shell takes; it drops
/// the ones in between.
pub const HEALTH_EVERY: Duration = Duration::from_secs(1);

/// How the engine is doing, from its `health` frame.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineHealth {
    /// Whether the routine scheduler ticks; `false` once a stop began.
    pub scheduling: bool,
    /// Whether routines are paused: by the shell's `pause_routines`, or
    /// because none has reached the engine yet.
    pub paused: bool,
    /// The runs going now, running or waiting.
    pub active_runs: u32,
    /// Of `active_runs`, the ones waiting for someone's answer, such as an
    /// approval: they need the user, and aren't in progress.
    pub runs_waiting: u32,
    /// When the scheduler last ticked, as an ISO time.
    pub last_tick: Option<String>,
    /// When the next routine is due to start, `None` when none is or
    /// routines are paused. Always a UTC time in the form
    /// `2026-11-25T14:00:00.000Z`: any other is a fault.
    pub next_routine_at: Option<String>,
}

/// A frame the session accepted.
#[derive(Debug)]
pub enum EngineEvent {
    /// The engine serves at the handshake's address, with its token.
    Handshake(Handshake),
    /// A broker request, to answer with the request's `id`.
    Request { id: u64, request: BrokerRequest },
    /// The engine's health.
    Health(EngineHealth),
    /// A `health` frame within [`HEALTH_EVERY`] of the last one taken.
    Dropped,
    /// The engine stopped after the shell's `stop`; it exits next.
    Stopped { interrupted: u32 },
}

/// One engine launch's side of the protocol, as the shell sees it: the
/// handshake first and only once, request ids that only go up, `stopped`
/// only after a `stop`, and nothing after it.
#[derive(Debug, Default)]
pub struct PipeSession {
    handshake_seen: bool,
    last_id: Option<u64>,
    stop_sent: bool,
    stopped: bool,
    last_health: Option<Instant>,
}

impl PipeSession {
    /// Notes that the shell sent `stop`, so a `stopped` may come.
    pub fn stop_sent(&mut self) {
        self.stop_sent = true;
    }

    /// Checks one frame's JSON bytes, read at `now`.
    ///
    /// # Errors
    ///
    /// A [`PipeFault`] for anything the protocol doesn't allow. The session
    /// is then over: the shell ends the engine.
    pub fn accept(&mut self, json: &[u8], now: Instant) -> Result<EngineEvent, PipeFault> {
        if self.stopped {
            return Err(PipeFault::Stopped);
        }
        let frame = parse_frame(json)?;
        if !self.handshake_seen {
            return self.first(frame);
        }
        match frame {
            EngineFrame::Handshake { .. } => Err(PipeFault::SecondHandshake),
            EngineFrame::SecretGet { id, name } => self.request(id, BrokerRequest::Secret { name }),
            EngineFrame::TokenGet { id, name } => self.request(id, BrokerRequest::Token { name }),
            EngineFrame::OriginsGet { id, name } => {
                self.request(id, BrokerRequest::Origins { name })
            }
            EngineFrame::Health {
                scheduling,
                paused,
                active_runs,
                runs_waiting,
                last_tick,
                next_routine_at,
            } => {
                let well_formed = runs_waiting <= active_runs
                    && next_routine_at.as_deref().is_none_or(is_iso_instant);
                if !well_formed {
                    return Err(PipeFault::NotAMessage);
                }
                Ok(self.health(
                    now,
                    EngineHealth {
                        scheduling,
                        paused,
                        active_runs,
                        runs_waiting,
                        last_tick,
                        next_routine_at,
                    },
                ))
            }
            EngineFrame::Stopped { interrupted } if self.stop_sent => {
                self.stopped = true;
                Ok(EngineEvent::Stopped { interrupted })
            }
            EngineFrame::Stopped { .. } => Err(PipeFault::Stopped),
        }
    }

    fn first(&mut self, frame: EngineFrame) -> Result<EngineEvent, PipeFault> {
        let EngineFrame::Handshake {
            protocol,
            url,
            token,
        } = frame
        else {
            return Err(PipeFault::BeforeHandshake);
        };
        if protocol != PROTOCOL_VERSION {
            return Err(PipeFault::Protocol);
        }
        // The agent host's own check: a loopback address and a 43-character
        // token, so the token can only ever go to the engine's address.
        let line = serde_json::json!({ "url": url, "token": token }).to_string();
        let handshake = read_handshake(&line).map_err(|_| PipeFault::Handshake)?;
        self.handshake_seen = true;
        Ok(EngineEvent::Handshake(handshake))
    }

    fn request(&mut self, id: u64, request: BrokerRequest) -> Result<EngineEvent, PipeFault> {
        if self.last_id.is_some_and(|last| id <= last) {
            return Err(PipeFault::RequestId);
        }
        self.last_id = Some(id);
        Ok(EngineEvent::Request { id, request })
    }

    fn health(&mut self, now: Instant, health: EngineHealth) -> EngineEvent {
        let too_soon = self
            .last_health
            .is_some_and(|last| now.saturating_duration_since(last) < HEALTH_EVERY);
        if too_soon {
            return EngineEvent::Dropped;
        }
        self.last_health = Some(now);
        EngineEvent::Health(health)
    }
}
