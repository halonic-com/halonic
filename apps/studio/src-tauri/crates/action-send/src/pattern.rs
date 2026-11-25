//! The patterns a route gives its placeholders and string body fields.
//!
//! The catalog writes them as JavaScript regular expressions, such as
//! `^[A-Za-z0-9._-]{1,100}$`. The shell takes no regex crate: it reads a
//! small subset of its own, and a pattern outside that subset fails to load,
//! so a route can never be looser in the shell than in the catalog.
//!
//! The subset: `^`, then items, then `$`. An item is a character class
//! (`[a-z0-9._-]`, `[^/]`), an escaped character (`\.`, `\-`, `\d`) or a
//! plain letter, digit, `-`, `_`, `:` or `@`, each followed by at most one
//! of `?`, `*`, `+`, `{n}`, `{m,}` or `{m,n}`. No `.`, `|` or groups.

/// The longest value a pattern is matched against, in characters.
pub const MAX_VALUE_CHARS: usize = 1024;

/// The most an item may repeat when its count has no upper bound.
const UNBOUNDED: usize = MAX_VALUE_CHARS;

/// One range of a character class, both ends included.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Range(char, char);

/// What one item matches: any character in its ranges, or outside them.
#[derive(Debug, Clone, PartialEq, Eq)]
struct CharSet {
    ranges: Vec<Range>,
    negated: bool,
}

impl CharSet {
    fn single(character: char) -> Self {
        Self {
            ranges: vec![Range(character, character)],
            negated: false,
        }
    }

    fn matches(&self, character: char) -> bool {
        let inside = self
            .ranges
            .iter()
            .any(|Range(low, high)| (*low..=*high).contains(&character));
        inside != self.negated
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Item {
    set: CharSet,
    min: usize,
    max: usize,
}

/// An anchored pattern the shell can match. Made only by [`Pattern::parse`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pattern {
    source: String,
    items: Vec<Item>,
}

impl Pattern {
    /// Reads a pattern, or says why it is outside the subset.
    pub fn parse(source: &str) -> Result<Self, String> {
        let body = source
            .strip_prefix('^')
            .and_then(|rest| rest.strip_suffix('$'))
            .ok_or_else(|| format!("`{source}` isn't anchored with ^ and $"))?;
        let mut characters = body.chars().peekable();
        let mut items = Vec::new();
        while let Some(character) = characters.next() {
            let set = match character {
                '[' => class(&mut characters)?,
                '\\' => escape(characters.next())?,
                plain if is_plain(plain) => CharSet::single(plain),
                other => {
                    return Err(format!(
                        "`{source}` uses `{other}`, which the shell doesn't read"
                    ));
                }
            };
            let (min, max) = quantifier(&mut characters)?;
            items.push(Item { set, min, max });
        }
        Ok(Self {
            source: source.to_owned(),
            items,
        })
    }

    /// Whether the whole value matches.
    pub fn matches(&self, value: &str) -> bool {
        let characters: Vec<char> = value.chars().collect();
        characters.len() <= MAX_VALUE_CHARS && match_from(&self.items, &characters)
    }

    /// The pattern as the catalog wrote it.
    pub fn source(&self) -> &str {
        &self.source
    }
}

fn is_plain(character: char) -> bool {
    character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ':' | '@')
}

type Characters<'a> = std::iter::Peekable<std::str::Chars<'a>>;

fn escape(character: Option<char>) -> Result<CharSet, String> {
    match character {
        Some('d') => Ok(CharSet {
            ranges: vec![Range('0', '9')],
            negated: false,
        }),
        Some(escaped) if escaped.is_ascii_punctuation() => Ok(CharSet::single(escaped)),
        Some(other) => Err(format!("the escape `\\{other}` isn't read by the shell")),
        None => Err("a pattern ends with `\\`".to_owned()),
    }
}

/// Reads a class after its `[`, up to and including its `]`.
fn class(characters: &mut Characters<'_>) -> Result<CharSet, String> {
    let negated = characters.next_if_eq(&'^').is_some();
    let mut ranges = Vec::new();
    loop {
        let low = match characters.next() {
            Some(']') if !ranges.is_empty() => return Ok(CharSet { ranges, negated }),
            Some('\\') => escaped_class_character(characters.next())?,
            Some('[') | None => return Err("a character class isn't closed".to_owned()),
            Some(character) => character,
        };
        // A `-` right before `]` is a plain `-`, as in `[a-z_-]`.
        let is_range = characters.peek() == Some(&'-') && {
            let mut ahead = characters.clone();
            ahead.next();
            ahead.peek().is_some_and(|&next| next != ']')
        };
        if !is_range {
            ranges.push(Range(low, low));
            continue;
        }
        characters.next();
        let high = match characters.next() {
            Some('\\') => escaped_class_character(characters.next())?,
            Some(character) => character,
            None => return Err("a character class isn't closed".to_owned()),
        };
        if high < low {
            return Err(format!("the range `{low}-{high}` runs backwards"));
        }
        ranges.push(Range(low, high));
    }
}

fn escaped_class_character(character: Option<char>) -> Result<char, String> {
    match character {
        Some(escaped) if escaped.is_ascii_punctuation() => Ok(escaped),
        Some(other) => Err(format!("the escape `\\{other}` isn't read inside a class")),
        None => Err("a character class isn't closed".to_owned()),
    }
}

fn quantifier(characters: &mut Characters<'_>) -> Result<(usize, usize), String> {
    match characters.peek() {
        Some('?') => {
            characters.next();
            Ok((0, 1))
        }
        Some('*') => {
            characters.next();
            Ok((0, UNBOUNDED))
        }
        Some('+') => {
            characters.next();
            Ok((1, UNBOUNDED))
        }
        Some('{') => {
            characters.next();
            counted(characters)
        }
        _ => Ok((1, 1)),
    }
}

/// Reads `n}`, `m,}` or `m,n}` after a `{`.
fn counted(characters: &mut Characters<'_>) -> Result<(usize, usize), String> {
    let mut text = String::new();
    for character in characters.by_ref() {
        if character == '}' {
            let (min, max) = match text.split_once(',') {
                None => (number(&text)?, number(&text)?),
                Some((min, "")) => (number(min)?, UNBOUNDED),
                Some((min, max)) => (number(min)?, number(max)?),
            };
            if min > max || max > UNBOUNDED {
                return Err(format!("the count `{{{text}}}` isn't one the shell reads"));
            }
            return Ok((min, max));
        }
        text.push(character);
    }
    Err("a `{` count isn't closed".to_owned())
}

fn number(text: &str) -> Result<usize, String> {
    if text.is_empty() || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(format!("`{text}` isn't a count"));
    }
    text.parse().map_err(|_| format!("`{text}` isn't a count"))
}

/// Matches the items against the characters, trying every count each item
/// allows. Each (item, position) is tried at most once: one that failed is
/// remembered, so stacked `*` items, such as `^a*a*a*b$`, can't make the
/// search grow exponentially. It stays within items × characters ×
/// [`MAX_VALUE_CHARS`] steps (Liam's review of HAL-17525).
fn match_from(items: &[Item], characters: &[char]) -> bool {
    let mut failed = vec![false; (items.len() + 1) * (characters.len() + 1)];
    match_at(items, characters, 0, 0, &mut failed)
}

fn match_at(
    items: &[Item],
    characters: &[char],
    item: usize,
    at: usize,
    failed: &mut [bool],
) -> bool {
    let Some(current) = items.get(item) else {
        return at == characters.len();
    };
    let state = item * (characters.len() + 1) + at;
    if failed[state] {
        return false;
    }
    let longest = characters[at..]
        .iter()
        .take(current.max)
        .take_while(|&&character| current.set.matches(character))
        .count();
    let found = (current.min..=longest)
        .rev()
        .any(|count| match_at(items, characters, item + 1, at + count, failed));
    if !found {
        failed[state] = true;
    }
    found
}
