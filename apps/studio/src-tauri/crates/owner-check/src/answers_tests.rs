use crate::{Availability, Confirmation, Decision, PromptWords};

#[test]
fn owner_check_reads_every_known_status() {
    assert_eq!(Availability::from_plugin("ready"), Availability::Ready);
    assert_eq!(
        Availability::from_plugin("not-enrolled"),
        Availability::NotEnrolled
    );
    assert_eq!(
        Availability::from_plugin("no-strong-biometric"),
        Availability::NoStrongBiometric
    );
    assert_eq!(
        Availability::from_plugin("android-too-old"),
        Availability::AndroidTooOld
    );
    assert_eq!(
        Availability::from_plugin("unavailable"),
        Availability::Unavailable
    );
}

#[test]
fn owner_check_reads_an_unknown_status_as_unavailable() {
    for status in ["", "Ready", "weak", "ready ", "confirmed"] {
        assert_eq!(
            Availability::from_plugin(status),
            Availability::Unavailable,
            "{status:?}"
        );
        assert!(!Availability::from_plugin(status).is_ready());
    }
}

#[test]
fn owner_check_reads_every_known_answer() {
    assert_eq!(
        Confirmation::from_plugin("confirmed"),
        Confirmation::Confirmed
    );
    assert_eq!(
        Confirmation::from_plugin("cancelled"),
        Confirmation::Cancelled
    );
    assert_eq!(
        Confirmation::from_plugin("locked-out"),
        Confirmation::LockedOut
    );
    assert_eq!(Confirmation::from_plugin("busy"), Confirmation::Busy);
    assert_eq!(
        Confirmation::from_plugin("not-enrolled"),
        Confirmation::Unavailable(Availability::NotEnrolled)
    );
    assert_eq!(
        Confirmation::from_plugin("android-too-old"),
        Confirmation::Unavailable(Availability::AndroidTooOld)
    );
}

#[test]
fn owner_check_passes_only_on_the_exact_confirmed_answer() {
    for answer in [
        "",
        "Confirmed",
        "confirmed ",
        "ok",
        "true",
        "ready",
        "success",
    ] {
        let confirmation = Confirmation::from_plugin(answer);
        assert!(!confirmation.is_confirmed(), "{answer:?}");
        assert_eq!(
            confirmation,
            Confirmation::Unavailable(Availability::Unavailable)
        );
    }
    assert!(Confirmation::from_plugin("confirmed").is_confirmed());
}

#[test]
fn owner_check_prompt_names_the_decision_in_fixed_words() {
    let approve = PromptWords::for_decision(Decision::Approve);
    let deny = PromptWords::for_decision(Decision::Deny);
    assert!(approve.description.starts_with("Approve "));
    assert!(deny.description.starts_with("Deny "));
    assert_eq!(approve.title, deny.title);
    assert_eq!(approve.cancel, "Cancel");
}
