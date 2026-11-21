/// Whether the phone can check its owner right now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Availability {
    /// A strong biometric is enrolled and can be asked for.
    Ready,
    /// The phone has a strong biometric sensor, but nothing is enrolled.
    NotEnrolled,
    /// The phone has no strong biometric: no sensor, or only a weak one
    /// such as face unlock from the front camera.
    NoStrongBiometric,
    /// Older than Android 11, which can't ask for strong biometrics only.
    AndroidTooOld,
    /// The sensor can't be used now (busy, needs a security update, or the
    /// platform's answer wasn't one we know).
    Unavailable,
}

impl Availability {
    /// Reads the plugin's `status` text. Unknown text is [`Self::Unavailable`].
    pub fn from_plugin(status: &str) -> Self {
        match status {
            "ready" => Self::Ready,
            "not-enrolled" => Self::NotEnrolled,
            "no-strong-biometric" => Self::NoStrongBiometric,
            "android-too-old" => Self::AndroidTooOld,
            _ => Self::Unavailable,
        }
    }

    pub fn is_ready(self) -> bool {
        self == Self::Ready
    }
}

/// How one owner check ended. Only [`Self::Confirmed`] lets an answer out.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Confirmation {
    /// The person passed a strong biometric in this prompt.
    Confirmed,
    /// The person closed the prompt, or Android closed it (the app went to
    /// the background, the screen turned off).
    Cancelled,
    /// Too many tries: Android locked the sensor for now or until the
    /// phone is unlocked with its PIN.
    LockedOut,
    /// Another prompt is already open; only one is asked at a time.
    Busy,
    /// The phone couldn't ask (see [`Availability`]).
    Unavailable(Availability),
}

impl Confirmation {
    /// Reads the plugin's `answer` text. Unknown text is unavailable.
    pub fn from_plugin(answer: &str) -> Self {
        match answer {
            "confirmed" => Self::Confirmed,
            "cancelled" => Self::Cancelled,
            "locked-out" => Self::LockedOut,
            "busy" => Self::Busy,
            other => Self::Unavailable(Availability::from_plugin(other)),
        }
    }

    pub fn is_confirmed(self) -> bool {
        self == Self::Confirmed
    }
}
