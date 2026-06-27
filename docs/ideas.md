# Ideas — "If Mythos comes out, what could we build?"

> Working assumption (correct me): **Mythos** is a capability for generating and
> *maintaining* persistent, internally-consistent fictional worlds / shared
> mythologies — narrative state that many people and agents can read, extend,
> and that the system keeps self-consistent over time. The product name
> `meethos` reads as **meet + mythos**: people meet *through* the myth their
> group creates. The ideas below lean into that; the last section hedges in case
> Mythos is really a new model/agent runtime.

The bar is "never been built before," so each idea names the **white space** and
the **moat** (why it's hard to copy), not just the feature.

---

## 1. Continuity-as-CI — "git + type-checker for worlds"

Every fact about a universe (characters, timelines, physics, relationships) is a
versioned, queryable node. Contributors — human *and* AI — propose lore as pull
requests. The engine **rejects continuity violations the way a compiler rejects
type errors**: a dead character can't speak in chapter 12, a 3-day journey can't
take 1, magic can't break its own established rules.

- **White space:** consistency checking for fiction has never existed as
  infrastructure. Writers' rooms, game studios, and franchises do it manually in
  wikis and spreadsheets that drift.
- **Moat:** the contradiction-detection engine + the accumulated canon graph.
  Network effect: the more lore, the more valuable the consistency guarantee.
- **First wedge:** tabletop campaigns and serialized fiction writers.

## 2. Mythogenesis — turn a real group's history into its mythology

Point it at a community's actual shared record (a company, a team, a town, a
Discord/Slack, a family) and it generates a coherent mythology: founding myths,
archetypal characters, recurring motifs, a pantheon, rituals. Onboarding a new
member = reading the group's myth.

- **White space:** "culture" today is a deck of values nobody reads. Nobody
  turns lived group history into *living narrative* automatically.
- **Moat:** the mapping from messy real events → durable archetypes, kept
  consistent and updated as the group keeps living.
- **This is the literal `meet + mythos`:** you meet people through the myth.

## 3. Persistent NPC societies with real emergent history

A shared mythos substrate where NPCs remember, form relationships, and
**propagate gossip and consequence across the whole world** — so history is
*emergent*, not scripted. Kill a merchant and the next town actually reacts a
week later because the news traveled.

- **White space:** games fake this with flags; nobody has a durable, world-scale
  social memory that holds together across sessions and players.
- **Moat:** simulation + consistency at scale without combinatorial drift.
- **Adjacent market:** training/rehearsal sims (negotiation, crisis, language).

## 4. Cross-medium canon compiler

Author the world once; **compile** it to different targets, each guaranteed
consistent: a novel outline, a TTRPG campaign book, a game design bible, a
screenplay continuity doc, a wiki. Change a fact once, every artifact updates.

- **White space:** franchises burn fortunes keeping adaptations consistent.
  There is no "source of truth → multiple targets" compiler for narrative.
- **Moat:** the IR (intermediate representation) for a world, plus the
  target-specific backends.

## 5. Memetics engine — how myths spread and mutate

Simulate how a story/belief/ritual propagates and mutates through a population.
Primary use is narrative design (give your world a *plausible* religion or
folklore). Dual use: a sandbox to study misinformation spread — defensively.

- **White space:** memetic spread is studied academically but not packaged as a
  tunable, narrative-grade simulator.
- **Moat:** the spread/mutation model validated against real diffusion data.

---

## If Mythos is actually a new model / agent runtime

Then the never-built targets shift to **long-horizon, persistent, multi-agent**
products that previous models couldn't sustain:

- **Worlds that run while you're gone** — a persistent simulation of agents with
  durable memory and goals; you check in like a garden, not a chat.
- **An agent that holds a months-long project in its head** — true durable
  working memory across thousands of sessions without context collapse.
- **Many-agent institutions** — a simulated org/market/court you can stress-test
  real policies against.

---

## How to use this file

These are bets, not commitments. Next step is to pick **one wedge** and write a
one-paragraph "smallest demo that proves the magic." Candidate to beat:
**Idea #1 (continuity-as-CI) scoped to a single serialized story** — smallest
build, clearest "whoa," and it's the substrate the others reuse.
