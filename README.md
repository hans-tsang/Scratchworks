# Scratchworks

An original, browser-based **incremental scratch-card workshop**. You run a small
workshop, buy scratch cards, reveal them with your mouse or finger, claim the
winnings, unlock new ticket collections, build automation, and eventually file
your run away as permanent **Blueprints**.

> **Fictional currency only.** Every amount in Scratchworks is denominated in
> ¤ **Workshop Credits**, an invented in-game currency. There is no real-money
> gambling, no deposits, no cash-outs, no ads and no microtransactions. Nothing
> can be bought or sold with real money, and nothing leaves your browser.

All artwork, ticket designs, symbol sets, rules text and the interface are
original to this repository. No third-party game assets, branding or layouts
are used.

---

## Feature summary

**Three original ticket mechanics**, each with fully published rules:

| Ticket | Mechanic | Rules |
| --- | --- | --- |
| **Match Three** | Reveal a 3×3 grid. | Matches count **anywhere on the card**, not along lines. Each symbol forms a single group from its total count; groups of 3+ pay, and **all qualifying groups are summed**. Larger groups multiply that symbol's value (3→×1 up to 9→×160). |
| **Treasure Trail** | Reveal a six-space run. | Payout = (sum of all coin values) × (product of all multiplier spaces) × ticket cost. Blank spaces add nothing. No hidden penalties; it can never pay less than ¤0. |
| **Garden Harvest** | Clearly labelled **high-risk**. Five plots. | Payout = (sum of reward values − sum of pest values) × ticket cost. The result can be negative — but only from the published symbol values, never from a hidden percentage of your bankroll. |

**Four collections** — Bench Basics, Copper Foundry, Clockwork Atelier and
Aurora Forge — each with all three ticket types, rising costs, rising luck caps,
and at least one reliable (positive expected return, zero-loss) progression
ticket so you are never forced to gamble on a risky ticket to advance.

**Scratching** — Canvas overlay erased with `destination-out` compositing.
Pointer Events (mouse, pen, touch), pointer-cancel and pointer-leave handling,
device-pixel-ratio aware, responsive, `touch-action: none` only on the card so
the rest of the page still scrolls, auto-reveal at **85 %** coverage estimated
from a coarse 14×14 coverage grid (never a full-canvas pixel read), and a
reduced-motion mode. An accessible **Reveal card** button produces exactly the
same outcome with the same eligibility rules.

**Transparent odds** — every ticket shows its symbol table, the *effective*
probabilities at your current luck level, its luck cap, the possible minimum and
maximum payout, the chance of a loss, and the **exact** expected gross payout and
expected net profit. The numbers are exact (not sampled) because every payout
rule depends only on symbol counts, so the full multinomial distribution is
enumerated.

**Automation** — three independent devices driven by one central simulation tick:

* **Buyer** — purchases the selected ticket; respects affordability, a
  configurable **cash reserve** and a configurable **queue limit**.
* **Scratcher** — reveals queued cards using the same logical reveal model as
  manual play; speed and capacity upgrades.
* **Collector** — claims completed cards; on/off toggle, interval upgrades.
  Taking a card by hand never turns it off.

Each device reports a meaningful state: *Working*, *Waiting for cash*,
*Queue full*, *Waiting for a card*, *Paused by player*, *Reserve limit reached*
or *Holding a risky card for review*.

**Risk protection** — a revealed negative card is never claimed silently. Without
the **Careful Collector** blueprint it is held for explicit confirmation (with the
actual capped loss previewed) and can be discarded instead; automation holds it
rather than deducting money. With Careful Collector the collector discards
negative cards automatically. Negative results can never push cash below ¤0.
Careful Collector prevents negative *claims* — it does not guarantee a profit and
does not refund ticket purchases.

**Progression safety** — a permanently available **Workshop job** gives modest
recovery income that can never cost anything, there are no loans or debt, no
automatic reset on bankruptcy, and a confirmation warning before any manual
purchase that would consume more than 25 % of your cash (which you can switch
off in Settings).

**Prestige** — reach the displayed run-winnings milestone to file **Blueprints**.
The preview lists exactly what resets and what persists, and separates
*Blueprints owned now* from *Blueprints you would be awarded*. Permanent
upgrades: Starting Capital, Automation Starter Kit, Faster Scratcher, Higher
Queue Capacity, Increased Blueprint Earnings and Careful Collector. The upgrade
tree and its costs are visible during a run, but Blueprints can only be spent on
the prestige screen (clearly labelled).

**Saving** — versioned JSON in `localStorage`, autosaved periodically and after
important transactions. Loading validates and repairs every field, drops cards
whose symbols do not match their ticket, and falls back to a fresh run rather
than crashing. Save export/import with validation, and a confirmed reset.
Unavailable or full storage is handled without crashing.

**Offline progress** — capped at **two hours**, simulated with the same `tick`
function and the same economic rules as live play (reserve cash, queue limits
and risky-card review all apply), using bounded fixed steps rather than replayed
frames. The clock always advances, so a window can never be credited twice. On
return you are told how much time was credited and what it earned.

**Interface** — original workshop theme built from CSS and generated shapes.
Desktop uses a three-panel layout; below 1080 px it collapses to the scratch area
plus tabs for Shop, Upgrades, Automation, Progress and Settings. One shared
currency formatter (K/M/B/T/Qa…), keyboard-accessible controls, visible focus
outlines, a dismissible onboarding note, a short event feed instead of pop-ups,
and mute and reduced-motion settings.

---

## Running it

```bash
npm install
npm run dev        # development server
npm run typecheck  # tsc -b, project references
npm run lint       # oxlint
npm test           # vitest run (unit + UI smoke tests)
npm run simulate   # seeded economy/balance simulation
npm run build      # tsc -b && vite build  →  dist/
npm run preview    # serve the production build locally
```

Requires Node 20.19+ / 22.12+ (Vite 8).

## Static deployment

The build output in `dist/` is a fully static site with no backend, no accounts
and no external services.

**Vercel** — import the repository. `vercel.json` is included and sets the Vite
framework preset, `npm run build` and `dist` as the output directory, so no extra
configuration is needed. Deploying from the CLI:

```bash
npm i -g vercel
vercel        # preview deployment
vercel --prod # production deployment
```

**Any other static host** (Netlify, Cloudflare Pages, GitHub Pages, S3, nginx):
run `npm run build` and serve `dist/`. The app is a single page with no routing,
so no rewrite rules are strictly required.

---

## Architecture

Game logic is pure and completely separate from rendering. Every module below is
independently testable and takes an injected, seeded RNG where randomness is
involved.

| Module | Responsibility |
| --- | --- |
| `src/game/rng.ts` | Seeded `mulberry32` generator, serialisable state, weighted picks. |
| `src/game/data/tickets.ts` | **Balancing config** — collections, ticket costs, symbol weights/values, luck caps, rules text. |
| `src/game/data/upgrades.ts` | **Balancing config** — run upgrades, automation curves, prestige constants, offline caps. |
| `src/game/luck.ts` | Luck → effective probability model and caps. |
| `src/game/payout.ts` | Symbol generation, payout evaluation and exact ticket analysis. |
| `src/game/economy.ts` | All money movement and card state transitions. |
| `src/game/automation.ts` | Central simulation tick and offline catch-up. |
| `src/game/prestige.ts` | Prestige preview, reset and permanent upgrades. |
| `src/game/save.ts` | Schema version, migration, validation/repair, export/import. |
| `src/game/goals.ts` | "Next goal" suggestions. |
| `src/game/format.ts` | The single shared currency/number/duration formatter. |
| `src/game/state.ts` | State shape, initial state and derived selectors. |
| `src/game/store.ts` | React glue: central tick, autosave, player actions. |
| `src/ui/*` | Rendering only. |

### Luck model

Each symbol has an *affinity* of +1 (good), 0 (neutral) or −1 (bad). At effective
luck `L` the weight of symbol `i` becomes

```
w'ᵢ = wᵢ × (1 + 0.02 × L) ^ affinityᵢ      then normalised
```

Normalisation guarantees every probability stays strictly positive and the set
always sums to exactly 1. Effective luck is `min(global luck, ticket luck cap)`,
so once a ticket is capped the probabilities stop changing and the UI says so.
Because good symbols can only gain weight and bad symbols can only lose it,
expected return is **non-decreasing** in luck for every ticket — this is asserted
in the tests at every supported luck level (0–30). Reaching a luck cap never
makes a risky ticket "safe"; Garden Harvest is still labelled high-risk at its
cap, where it retains a ~36 % chance of a negative card.

### Numbers

Ordinary JavaScript numbers are used. Every currency value passes through
`clampCurrency`, which maps `NaN` to 0 and clamps to ±`MAX_CURRENCY` = 1 × 10¹⁵,
well inside `Number.MAX_SAFE_INTEGER` (≈9 × 10¹⁵). Progression is tuned and
tested far below that bound, so overflow, `Infinity` and `NaN` cannot enter the
economy.

### Enforced guarantees

Covered by tests in `src/game/__tests__/`:

* a purchase subtracts its cost exactly once, and only when affordable, unlocked and within the queue limit;
* a card's symbols are generated once at purchase and are never rerolled by scratching or reloading;
* the payout is derived from the symbols, so it can never contradict what you see;
* a claim pays exactly once; a claimed or discarded card can never be claimed again;
* automation cannot bypass negative-card confirmation;
* reserve cash and queue limits hold for both online and offline simulation;
* an offline window is never credited twice;
* prestige resets run state and preserves permanent state;
* currency stays finite, non-`NaN` and non-negative.

---

## Balancing configuration

All tunable numbers live in exactly two files, both marked `BALANCING CONFIG`:

* **`src/game/data/tickets.ts`** — `COLLECTIONS` (names and unlock thresholds),
  `MATCH_GROUP_MULTIPLIER`, `MATCH3_VALUE_SCALE`, the per-collection `TUNING`
  table (ticket costs, luck caps) and the symbol templates with their weights,
  affinities and values.
* **`src/game/data/upgrades.ts`** — `RUN_UPGRADES` base costs and growth,
  `buyerInterval` / `scratchRate` / `scratcherCapacity` / `collectorInterval`
  curves, ticket-level constants, `JOB_COOLDOWN_MS`, `PERMANENT_UPGRADES`,
  `startingCash`, `PRESTIGE_REQUIREMENT`, `BLUEPRINT_DIVISOR` and
  `OFFLINE_CAP_MS`.

After changing either file, re-run `npm run simulate` and `npm test`.

---

## Tests and simulations actually run

### `npm test` — 75 tests across 6 files, all passing

| File | Covers |
| --- | --- |
| `src/game/__tests__/payout.test.ts` (12) | Probability normalisation at all 31 luck levels, luck caps, symbol→payout consistency, level multipliers never deepening losses, standard tickets never negative, expected return non-decreasing in luck, every collection having a reliable progression ticket, deterministic generation. |
| `src/game/__tests__/economy.test.ts` (23) | Purchase cost applied once, insufficient funds, locked collections, queue capacity, reserve cash, auto queue limit, auto-reveal threshold, Reveal-card parity, no reroll while scratching, claim-once / no double claim, gross winnings tracked separately from cash, discard finality, no refund, negative-card confirmation, capped loss, cash floor of ¤0, Workshop job, upgrade costs. |
| `src/game/__tests__/automation.test.ts` (17) | Buyer/scratcher/collector locked, off and working states, reserve cash, waiting-for-cash, queue limits, capacity ceiling, collector unaffected by manual claims, risky cards held by default, Careful Collector auto-discard, offline two-hour cap, no double credit, clock always advancing, offline obeying reserve cash, no offline income without automation, numeric safety over a 30-minute run. |
| `src/game/__tests__/prestige.test.ts` (10) | Milestone gating, owned vs pending Blueprints, reset/persistence split, starting capital, starter kit, permanent upgrade costs, max levels, Careful Collector present. |
| `src/game/__tests__/save.test.ts` (10) | Round-trip preserving cash, progression and exact card outcomes; no reroll on reload; non-object and malformed saves repaired; mismatched symbols dropped; import validation; shared formatter output; currency clamping. |
| `src/ui/__tests__/app.test.tsx` (3) | The real app mounts in jsdom; a full buy → reveal → claim flow driven through the actual UI buttons; every button has an accessible label. |

`npm run typecheck`, `npm run lint` and `npm run build` all pass
(`dist` ≈ 282 kB JS / 87 kB gzipped, 9.5 kB CSS).

### `npm run simulate` — seeded economy simulation

Simulates a conservative manual strategy and an automation-focused strategy with
deterministic seeds, printing exact expected returns for all 12 tickets at luck
levels 0–30, the time to each milestone, and warnings for cash starvation and
progression stalls. Latest run:

| Milestone | Target | Conservative (seed 12345) | Automated (seed 12345) | Automated (seed 777) |
| --- | --- | --- | --- | --- |
| First upgrade | 30–60 s | 12 s | 12 s | 1 m 36 s |
| First automation | 3–5 min | 3 m 58 s | 3 m 58 s | 2 m 44 s |
| Second collection | 5–10 min | 6 m 38 s | 6 m 38 s | 6 m 01 s |
| Third collection | — | 10 m 22 s | 10 m 22 s | 13 m 01 s |
| Fourth collection | — | 11 m 52 s | 12 m 28 s | 23 m 20 s |
| First prestige | ~20–30 min | 24 m 48 s | 18 m 46 s | 29 m 31 s |
| Cash starvation | none | 0 s | 0 s | 0 s |

Expected gross return at luck 0 is ×1.35 for Match Three, ×1.40 for Treasure
Trail and ×1.15 for Garden Harvest (with a 42.6 % chance of a negative card),
rising with luck up to each ticket's cap. No stalls or cash starvation were
detected on any seed.

**Targets not fully met.** The second collection, first automation and cash-safety
targets are met on every seed. The others are close but variance-dependent:

* *First upgrade* lands at 12 s on seeds that hit an early win and 1 m 36 s on
  seeds that do not, straddling the 30–60 s target. Because the first luck
  upgrade costs ¤11 against ¤10 of starting capital, the exact moment is decided
  by one or two early cards; tightening it further would mean removing that early
  variance entirely.
* *First prestige* ranges 18 m 46 s – 29 m 31 s against the ~20–30 minute target;
  the automated strategy on the luckiest seed finishes about a minute early.

---

## Limitations

* The simulator models a *policy*, not a person: it assumes about two manual
  purchases per second and one manual reveal every two seconds. Real pacing will
  vary, and the first-upgrade and first-prestige timings above are sensitive to
  the seed.
* There is no audio in the MVP; the **Mute** setting is wired through state and
  honoured by the UI but currently has no sounds to silence.
* Ticket levels improve payouts; they do not yet unlock additional mechanics.
* Progression is tuned and tested well below the ¤1 × 10¹⁵ cap, so very long
  idle sessions will plateau rather than scale indefinitely.
* Offline progress is capped at two hours by design, so longer absences are not
  credited beyond that.
* Save data lives only in this browser's `localStorage`; use **Export save** in
  Settings to move it between devices.
