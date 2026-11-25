//! Opening a guided step's page or a `browser` block's address. The shell
//! can't see the user's clicks, so it allows what one click could ask for:
//! one open of a page every [`SAME_PAGE_GAP_MS`], and one open of any page
//! every [`ANY_PAGE_GAP_MS`]. Page script that keeps asking gets
//! `too-often` (architecture note on HAL-17491, 2.4).

use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

use url::Url;

use crate::call::{Refusal, StepRef, check_placeholders};
use crate::routes::RouteList;
use crate::web::{check_page, guided_address};

/// How long before the same page may open again, in milliseconds.
pub const SAME_PAGE_GAP_MS: u64 = 3_000;

/// How long before any page may open again, in milliseconds.
pub const ANY_PAGE_GAP_MS: u64 = 1_000;

/// When each page last opened. One per shell, shared by every window.
#[derive(Debug, Default)]
pub struct OpenLimiter {
    last: Mutex<(u64, HashMap<String, u64>)>,
}

impl OpenLimiter {
    /// Whether the page may open at `now` (milliseconds on any clock that
    /// only goes forward), and if so, counts the open.
    pub fn allow(&self, page: &str, now: u64) -> bool {
        let mut last = self.last.lock().unwrap_or_else(PoisonError::into_inner);
        let (any, pages) = &mut *last;
        let too_soon_for_any = *any != 0 && now.saturating_sub(*any) < ANY_PAGE_GAP_MS;
        let too_soon_for_page = pages
            .get(page)
            .is_some_and(|&opened| now.saturating_sub(opened) < SAME_PAGE_GAP_MS);
        if too_soon_for_any || too_soon_for_page {
            return false;
        }
        *any = now;
        pages.insert(page.to_owned(), now);
        true
    }
}

/// The address of a guided step's page, after its checks and the limit.
pub fn open_guided(
    routes: &RouteList,
    limiter: &OpenLimiter,
    request: &StepRef,
    now: u64,
) -> Result<Url, Refusal> {
    let route = routes
        .guided
        .get(&request.key())
        .ok_or(Refusal::NotInCatalog)?;
    check_placeholders(&route.placeholders, &request.placeholders)?;
    let address = guided_address(route, &request.placeholders).ok_or(Refusal::BadValue)?;
    if !limiter.allow(address.as_str(), now) {
        return Err(Refusal::TooOften);
    }
    Ok(address)
}

/// A `browser` block's address, after its checks and the limit. The reason
/// for a refusal goes to the shell's log; the page gets `bad-value`.
pub fn open_page(
    routes: &RouteList,
    limiter: &OpenLimiter,
    address: &str,
    now: u64,
) -> Result<Url, (Refusal, Option<String>)> {
    let page =
        check_page(address, &routes.web_origins).map_err(|why| (Refusal::BadValue, Some(why)))?;
    if !limiter.allow(page.as_str(), now) {
        return Err((Refusal::TooOften, None));
    }
    Ok(page)
}
