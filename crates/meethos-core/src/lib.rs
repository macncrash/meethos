//! # meethos-core
//!
//! Core domain types and engine logic for meethos. The CLI and any future
//! services (HTTP API, worker, etc.) depend on this crate so that business
//! logic stays decoupled from any particular interface.
//!
//! Nothing of substance lives here yet — this is the seam where the real
//! engine will grow. See `docs/architecture.md`.

use thiserror::Error;

/// Errors surfaced by the core engine.
#[derive(Debug, Error)]
pub enum Error {
    /// Placeholder variant; replace with real failure modes.
    #[error("not yet implemented: {0}")]
    Unimplemented(&'static str),
}

/// Convenience result alias used throughout the crate.
pub type Result<T> = std::result::Result<T, Error>;

/// Returns the crate version string, useful for `--version` plumbing.
#[must_use]
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_non_empty() {
        assert!(!version().is_empty());
    }
}
