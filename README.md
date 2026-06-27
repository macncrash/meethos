# meethos

A Rust workspace for building on **Mythos**.

> Status: early scaffold. The engine seam lives in `meethos-core`; the CLI is a
> thin shell over it. See [`docs/architecture.md`](docs/architecture.md) and
> [`docs/ideas.md`](docs/ideas.md).

## Layout

```
meethos/
├── Cargo.toml              # workspace manifest (shared deps, lints, profiles)
├── rust-toolchain.toml     # pinned stable toolchain + rustfmt/clippy
├── rustfmt.toml            # formatting config
├── crates/
│   ├── meethos-core/       # library: domain types + engine (no I/O coupling)
│   └── meethos-cli/        # binary: `meethos` CLI over the core library
├── docs/                   # architecture notes and idea backlog
└── .github/workflows/      # CI: fmt + clippy + test
```

## Quick start

```bash
cargo run -p meethos-cli -- info   # prints version
cargo test --workspace             # run all tests
cargo clippy --all-targets         # lint
cargo fmt --all                    # format
```

## Adding a crate

Drop a new package under `crates/` — the workspace globs `crates/*`, so it is
picked up automatically. Inherit shared config with `version.workspace = true`,
`edition.workspace = true`, and `[lints] workspace = true`.

## License

Dual-licensed under MIT or Apache-2.0, at your option.
