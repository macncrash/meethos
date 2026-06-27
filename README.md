<h1 align="center">meethos</h1>

<p align="center">
  <i>A multi-scale simulation library — and <b>Earth(3)</b>, the game built on it.</i>
</p>

---

**meethos** is the umbrella for a universe-scale simulation layer and the game that drives it.

- **[`earth3/`](earth3/) — Earth(3)** &nbsp;·&nbsp; the game. A living universe you fall through in one
  continuous zoom — from the cosmic web, into the Milky Way, down to the Solar System, onto Earth,
  and into a city — with a comet-defense survival mode and cross-scale consequences. Headed for
  **earth3.app**.

- **[`packages/`](packages/) — meethos (library)** &nbsp;·&nbsp; *(forthcoming)* the reusable
  simulation layer extracted from the game over time: a **multi-scale universe simulator**, the
  beginnings of **stellar cartography** (procedural galaxies, star systems, planets), deterministic
  RNG, Keplerian orbits, and the floating-origin / regime machinery. Engine DNA borrowed from
  **[ethersim.ai](https://ethersim.ai)**.

The game lives at the top of the tree for now; the library components graduate into `packages/` as
they solidify, until meethos can stand on its own.

## Layout

```
meethos/
├── earth3/      the Earth(3) game (TypeScript · Vite · Three.js)
├── packages/    (reserved) the meethos library, extracted from the game over time
├── LICENSE-MIT · LICENSE-APACHE
```

## Run the game

```bash
cd earth3
bun install
bun run dev        # http://localhost:5174
```

See [`earth3/README.md`](earth3/README.md) for the game itself.

## License

Dual-licensed under MIT or Apache-2.0. Engine patterns adapted from ethersim (MIT).
