//! A frame's own process (HAL-20468): one top-level window, with the app's
//! title, icons and taskbar ID, that Halonic's window for the app fills.
//!
//! 1. One frame per app: a second start brings the first one's window
//!    forward and quits.
//! 2. The frame shows its window as its shortcut asks, then starts Halonic
//!    with `--app <name> --host-window <its handle>`. A running Halonic
//!    takes that start over (tauri-plugin-single-instance), so the page
//!    still shares one engine and one connection with Studio.
//! 3. Halonic opens its window for the app as a child of the frame. The
//!    frame keeps it the size of its inside, hands it the focus, and asks
//!    it to close when the frame is closed, so the page decides as before.
//! 4. When Halonic's window is gone (closed, Halonic quit or crashed), or
//!    none came within a minute, the frame quits too.
//!
//! The window procedure keeps its state in statics: there is one frame
//! window per process, on the process's one thread.

use std::process::ExitCode;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, Ordering};

use halonic_window_app_id::WindowIcons;
use windows_sys::Win32::Foundation::{
    ERROR_ALREADY_EXISTS, GetLastError, HWND, LPARAM, LRESULT, RECT, WPARAM,
};
use windows_sys::Win32::Graphics::Gdi::{COLOR_WINDOW, GetSysColorBrush};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::CreateMutexW;
use windows_sys::Win32::UI::HiDpi::{
    DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, GetDpiForWindow, SetProcessDpiAwarenessContext,
};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::SetFocus;
use windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    ASFW_ANY, AllowSetForegroundWindow, CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, CreateWindowExW,
    DefWindowProcW, DestroyWindow, DispatchMessageW, FindWindowW, GW_CHILD, GetClientRect,
    GetMessageW, GetWindow, IDC_ARROW, IsWindowVisible, LoadCursorW, MSG, PostMessageW,
    PostQuitMessage, RegisterClassExW, SW_HIDE, SW_SHOW, SW_SHOWDEFAULT, SWP_ASYNCWINDOWPOS,
    SWP_NOACTIVATE, SWP_NOZORDER, SetTimer, SetWindowPos, ShowWindow, TranslateMessage, WM_CLOSE,
    WM_DESTROY, WM_DPICHANGED, WM_PARENTNOTIFY, WM_SETFOCUS, WM_SIZE, WM_TIMER, WNDCLASSEXW,
    WS_CLIPCHILDREN, WS_OVERLAPPEDWINDOW,
};

use crate::{FrameApp, host_arguments, main_exe};

/// How often the frame looks at Halonic's window, in milliseconds.
const CHECK_EVERY_MS: u32 = 250;

/// How many checks the frame waits for Halonic's window before it quits:
/// a minute, enough for a cold start of Halonic.
const CHECKS_BEFORE_GIVING_UP: u32 = 240;

/// The frame's one timer.
const CHECK_TIMER: usize = 1;

/// Halonic's window in the frame, once it came.
static CHILD: AtomicIsize = AtomicIsize::new(0);
/// Whether Halonic's window came at all.
static ADOPTED: AtomicBool = AtomicBool::new(false);
/// The checks made while waiting for Halonic's window.
static WAITED: AtomicU32 = AtomicU32::new(0);
/// The frame's icons, kept while the window uses them.
static ICONS: Mutex<Option<WindowIcons>> = Mutex::new(None);
/// The app the frame is for.
static APP: Mutex<Option<FrameApp>> = Mutex::new(None);

/// Runs `app`'s frame until its window closes.
pub fn run(app: FrameApp) -> ExitCode {
    if let Ok(mut slot) = APP.lock() {
        *slot = Some(app);
    }
    let app_id = wide(&app.app_user_model_id());
    // SAFETY: no pointers but the ID, which ends in a 0 and outlives the
    // call. A failure leaves the system's defaults, which still work.
    unsafe {
        SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        SetCurrentProcessExplicitAppUserModelID(app_id.as_ptr());
    }
    let class = wide(&format!("HalonicFrame.{}", app.name()));
    let mutex_name = wide(&format!("Local\\{}.frame", app.app_user_model_id()));
    // SAFETY: the name ends in a 0 and outlives the call. The mutex is
    // held until the process ends, which releases it.
    let mutex = unsafe { CreateMutexW(std::ptr::null(), 0, mutex_name.as_ptr()) };
    // SAFETY: no pointers; it reads this thread's last error.
    if mutex.is_null() || unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        return bring_first_forward(&class);
    }
    let Some(frame) = create(app, &class) else {
        return ExitCode::FAILURE;
    };
    if start_halonic(app, frame).is_err() {
        // SAFETY: the frame's own window, destroyed once.
        unsafe { DestroyWindow(frame) };
        return ExitCode::FAILURE;
    }
    // SAFETY: the frame's own window; the timer has no callback, so it
    // arrives as WM_TIMER.
    unsafe { SetTimer(frame, CHECK_TIMER, CHECK_EVERY_MS, None) };
    pump()
}

/// A frame for this app runs already: its window comes forward instead.
fn bring_first_forward(class: &[u16]) -> ExitCode {
    // SAFETY: the class name ends in a 0 and outlives the call.
    let first = unsafe { FindWindowW(class.as_ptr(), std::ptr::null()) };
    if !first.is_null() {
        let _ = crate::platform::bring_forward(first as isize);
    }
    ExitCode::SUCCESS
}

/// Registers the frame's class and opens its window, shown as the start
/// asks, with the app's icons and taskbar ID. `None` when Windows refused.
fn create(app: FrameApp, class: &[u16]) -> Option<HWND> {
    let title = wide(app.title());
    // SAFETY: a null name asks for this exe's own module.
    let module = unsafe { GetModuleHandleW(std::ptr::null()) };
    let class_info = WNDCLASSEXW {
        cbSize: size_of::<WNDCLASSEXW>() as u32,
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(window_proc),
        hInstance: module,
        // SAFETY: a system cursor and a system brush, which are never freed.
        hCursor: unsafe { LoadCursorW(std::ptr::null_mut(), IDC_ARROW) },
        // SAFETY: as above.
        hbrBackground: unsafe { GetSysColorBrush(COLOR_WINDOW) },
        lpszClassName: class.as_ptr(),
        ..Default::default()
    };
    // SAFETY: the class's strings end in a 0 and outlive the process's use
    // of the class, which ends with `run`.
    if unsafe { RegisterClassExW(&class_info) } == 0 {
        return None;
    }
    // SAFETY: the class was registered above; the strings outlive the call.
    let frame = unsafe {
        CreateWindowExW(
            0,
            class.as_ptr(),
            title.as_ptr(),
            WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            module,
            std::ptr::null(),
        )
    };
    if frame.is_null() {
        return None;
    }
    // Without its own ID or icons the frame still works, in Halonic's entry.
    let _ = halonic_window_app_id::set(frame, &app.app_user_model_id());
    set_icons(frame, app);
    // Where it was when it last closed, or else where the shortcut's "Run"
    // choice (normal, minimised or maximised) and Windows put it.
    if !crate::placement::restore(frame, app) {
        // SAFETY: the frame's own window.
        unsafe { ShowWindow(frame, SW_SHOWDEFAULT) };
    }
    Some(frame)
}

/// Starts Halonic for `app` in `frame`. It may come forward: the frame was
/// just started by the person, so it may hand that on.
fn start_halonic(app: FrameApp, frame: HWND) -> std::io::Result<()> {
    let folder = std::env::current_exe()?
        .parent()
        .map(ToOwned::to_owned)
        .ok_or(std::io::ErrorKind::NotFound)?;
    let halonic = main_exe(&folder).ok_or(std::io::ErrorKind::NotFound)?;
    // SAFETY: no pointers.
    unsafe { AllowSetForegroundWindow(ASFW_ANY) };
    crate::platform::new_command(halonic)
        .args(host_arguments(app, frame as isize))
        .spawn()
        .map(|_| ())
}

/// Pumps the frame's messages until its window is destroyed.
fn pump() -> ExitCode {
    // SAFETY: an all-zero MSG is a valid empty one, filled by GetMessageW.
    let mut message: MSG = unsafe { std::mem::zeroed() };
    // SAFETY: the message lives on this stack through each call; the loop
    // ends at WM_QUIT (0) or an error (-1).
    while unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) } > 0 {
        // SAFETY: as above.
        unsafe {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
    ExitCode::SUCCESS
}

unsafe extern "system" fn window_proc(
    frame: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        // A window in the frame came or went: look at once, not at the next tick.
        WM_PARENTNOTIFY | WM_TIMER => check(frame),
        WM_SIZE => fit(frame),
        WM_SETFOCUS => {
            if let Some(child) = child() {
                // SAFETY: Windows checks the handle; Halonic's window shares
                // the frame's input, so it may take the focus.
                unsafe { SetFocus(child) };
            }
        }
        WM_CLOSE => match child() {
            // Halonic's window decides, and the frame follows it out.
            // SAFETY: Windows checks the handle.
            Some(child) => unsafe {
                PostMessageW(child, WM_CLOSE, 0, 0);
            },
            // SAFETY: the frame's own window, from its own procedure.
            None => unsafe {
                DestroyWindow(frame);
            },
        },
        crate::CAPTION_MESSAGE => colour_caption(frame, wparam),
        WM_DPICHANGED => {
            let suggested = lparam as *const RECT;
            // SAFETY: for WM_DPICHANGED, lparam points at the rect Windows
            // suggests, valid through the message.
            if let Some(rect) = unsafe { suggested.as_ref() } {
                // SAFETY: the frame's own window.
                unsafe {
                    SetWindowPos(
                        frame,
                        std::ptr::null_mut(),
                        rect.left,
                        rect.top,
                        rect.right - rect.left,
                        rect.bottom - rect.top,
                        SWP_NOZORDER | SWP_NOACTIVATE,
                    )
                };
            }
            if let Ok(Some(app)) = APP.lock().map(|app| *app) {
                set_icons(frame, app);
            }
        }
        WM_DESTROY => {
            if let Ok(Some(app)) = APP.lock().map(|app| *app) {
                crate::placement::save(frame, app);
            }
            // SAFETY: no pointers.
            unsafe { PostQuitMessage(0) };
        }
        // SAFETY: the arguments are the ones Windows passed in.
        _ => return unsafe { DefWindowProcW(frame, message, wparam, lparam) },
    }
    0
}

/// Halonic's window in the frame, if it is there.
fn child() -> Option<HWND> {
    let child = CHILD.load(Ordering::SeqCst);
    (child != 0).then_some(child as HWND)
}

/// Takes Halonic's window when it came, follows it when it hides or shows,
/// and closes the frame when it went, or never came.
fn check(frame: HWND) {
    // SAFETY: the frame's own window; the answer is its first child or null.
    let child = unsafe { GetWindow(frame, GW_CHILD) };
    if child.is_null() {
        let gave_up = WAITED.fetch_add(1, Ordering::SeqCst) >= CHECKS_BEFORE_GIVING_UP;
        if ADOPTED.load(Ordering::SeqCst) || gave_up {
            // SAFETY: the frame's own window, from its own thread.
            unsafe { DestroyWindow(frame) };
        }
        return;
    }
    ADOPTED.store(true, Ordering::SeqCst);
    if CHILD.swap(child as isize, Ordering::SeqCst) != child as isize {
        fit(frame);
    }
    // SAFETY: Windows checks both handles.
    unsafe {
        let shows = IsWindowVisible(child) != 0;
        if shows != (IsWindowVisible(frame) != 0) {
            ShowWindow(frame, if shows { SW_SHOW } else { SW_HIDE });
        }
    }
}

/// Makes Halonic's window fill the frame's inside. Asynchronous, so a
/// Halonic that is busy never holds up the frame.
fn fit(frame: HWND) {
    let Some(child) = child() else {
        return;
    };
    let mut inside = RECT::default();
    // SAFETY: the frame's own window; Windows writes into the local rect.
    if unsafe { GetClientRect(frame, &mut inside) } == 0 {
        return;
    }
    // SAFETY: Windows checks the handle.
    unsafe {
        SetWindowPos(
            child,
            std::ptr::null_mut(),
            0,
            0,
            inside.right - inside.left,
            inside.bottom - inside.top,
            SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS,
        )
    };
}

/// Colours the frame's title bar as Halonic's page asked: `colour` is a
/// `COLORREF`, `0x00bbggrr`. A bar Windows can't colour keeps its own.
fn colour_caption(frame: HWND, colour: WPARAM) {
    let caption = halonic_window_caption::Rgb {
        red: (colour & 0xff) as u8,
        green: ((colour >> 8) & 0xff) as u8,
        blue: ((colour >> 16) & 0xff) as u8,
    };
    let _ = halonic_window_caption::set(frame, caption);
}

/// Gives `frame` `app`'s icons at its display's scale, keeping them.
fn set_icons(frame: HWND, app: FrameApp) {
    // SAFETY: Windows checks the handle; it answers 96 for a bad one.
    let dpi = unsafe { GetDpiForWindow(frame) };
    let Ok(icons) = halonic_window_app_id::set_icons(frame, app.ico(), dpi) else {
        return;
    };
    if let Ok(mut kept) = ICONS.lock() {
        *kept = Some(icons);
    }
}

/// `text` as UTF-16 ending in a 0, as Windows takes it.
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}
