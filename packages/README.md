# packages/ — the meethos library (reserved)

This is where the reusable **meethos** simulation layer will live as it's extracted from the
**[Earth(3)](../earth3/)** game. Nothing is published here yet; the pieces are still proving
themselves inside the game.

Candidates to graduate here:

- **universe simulator** — the multi-scale "regime" engine: cross-faded, camera-flown hand-offs
  between scales, deterministic seeds, and (eventually) true f64 floating-origin.
- **stellar cartography** — procedural galaxies, star systems, and planets; Keplerian orbits;
  the cosmic web and structure formation.
- shared primitives — RNG, color/blackbody, orbital math.

Engine DNA is borrowed from **[ethersim.ai](https://ethersim.ai)**.
