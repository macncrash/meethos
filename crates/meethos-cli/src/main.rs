//! meethos command-line entry point.

use anyhow::Result;
use clap::{Parser, Subcommand};

/// meethos — a workspace for building on Mythos.
#[derive(Debug, Parser)]
#[command(name = "meethos", version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Print version and environment info.
    Info,
}

// `main` returns `Result` so `?` works as the engine grows; the wrap is not
// "unnecessary" in intent even though nothing fails yet.
#[allow(clippy::unnecessary_wraps)]
fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Command::Info => {
            println!("meethos {}", meethos_core::version());
            println!("core: {}", meethos_core::version());
        }
    }

    Ok(())
}
