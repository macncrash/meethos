# Architecture

## Principles

1. **Core is interface-agnostic.** `meethos-core` holds domain types and engine
   logic with no dependency on a CLI, HTTP framework, or database driver. This
   keeps the surface that matters testable and reusable.
2. **Interfaces are thin.** `meethos-cli` (and any future `meethos-server`,
   `meethos-worker`) parse input, call into core, and render output. They own
   I/O and configuration, not business rules.
3. **Errors are typed at the core, contextual at the edge.** Core uses
   `thiserror` enums; binaries use `anyhow` for ergonomic context.

## Crate graph

```
meethos-cli ──depends-on──> meethos-core
   (bin)                       (lib)
```

Add crates by following the same rule: shared logic sinks toward `meethos-core`;
new entry points sit beside `meethos-cli`.

## Where things will grow

- `meethos-core/src/` — split into modules (`domain`, `engine`, `store`) as the
  model takes shape. Promote to submodules/files once `lib.rs` gets busy.
- `crates/meethos-server/` — likely the next crate when a network surface is
  needed.
- `tests/` at each crate root — integration tests that exercise public APIs.
- `benches/` — add when there is a hot path worth measuring (Criterion).
