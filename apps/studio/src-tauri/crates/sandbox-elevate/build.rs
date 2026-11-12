//! The helper's executable asks Windows for administrator rights itself, so
//! starting it from Installed apps gives the one prompt, and a program that
//! starts it without asking gets refused instead of a quiet second prompt
//! from srt-win. It loads the libraries it imports only from System32, never
//! from the user's app folder it is started from (HAL-1415, risk 2).
fn main() {
    let target = std::env::var("TARGET").unwrap_or_default();
    if target.ends_with("-windows-msvc") {
        println!("cargo:rustc-link-arg-bins=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg-bins=/MANIFESTUAC:level='requireAdministrator'");
        // LOAD_LIBRARY_SEARCH_SYSTEM32.
        println!("cargo:rustc-link-arg-bins=/DEPENDENTLOADFLAG:0x800");
    }
}
