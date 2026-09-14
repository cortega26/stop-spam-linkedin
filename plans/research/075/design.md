# Plan 075 — DOM-drift tripwire: signal design (spike, observe-only)

> Status: research spike. No production file is wired to this design.
> All line references are to the worktree at base `eaf7631`
> (post-074: lines after `content.js:1267` shift by +1 vs plan-time).
> Quoted timing numbers come from plan 067's verdict and `content.js`
> `CONFIG`, not from new measurement.

## 1. What is counted (counts only, never text)

Per `scan(root)` invocation (content.js:666-681), record one
**scan event** — three integers, no strings, no DOM references:

| Counter | Source | Meaning |
|---|---|---|
| `textNodesSeen` | `matches.length` from `findSpamTextNodes(root)` (content.js:670) | spam-pattern text hits in this scan |
| `containersResolved` | non-null results of `SS_findPostContainer(textNode, CONFIG, POST_SELECTORS)` (content.js:672) | hits that resolved to a blockable container |
| `postsEnumerated` | candidates enumerated by `scanForBlockedAuthors` / `scanForLabeledPosts` via `AUTHOR_BLOCK_SELECTORS` (content.js:693-705, 720-731) | post-shaped elements present regardless of text match |

Windows are keyed to **scan invocations, not wall-clock**: the 500 ms
observer debounce (`CONFIG.OBSERVER_DEBOUNCE_MS`, content.js:17) plus
the `requestIdleCallback` 2000 ms timeout (content.js:767-768) make
wall-clock windows couple to idle-callback jitter (plan 067 observed
median 510 ms append-to-placeholder dominated by the 500 ms debounce).
Counting invocations keeps the tripwire independent of that jitter.

`postsEnumerated` is **diagnostic context only, not part of the fire
condition**, for a reason found by reading the guards: the passes that
produce it early-return in default configuration —
`scanForBlockedAuthors` returns when `blockedAuthors.size === 0`
(content.js:690), `scanForLabeledPosts` when `hidePromoted` is off
(content.js:717), `scanForFeaturedSection` when `hideFeatured` is off
or the page is not a profile (content.js:742). So in default config
`postsEnumerated` is identically 0 and gating on it would blind the
signal; conversely, gating on `postsEnumerated > 0` alone would
false-fire for blocklist users on clean feeds (posts enumerated, no
spam text, hence trivially zero resolutions). Its value is printed on
the console line so a maintainer can distinguish "posts present,
resolution broken" (`> 0`) from "matchable text outside any
post-shaped element" (`== 0` in a non-default config).

Proposed hook points (read-only specification for a future build):

- H1 — end of `scan()` (after the content.js:671-680 loop): emit the
  scan event with `textNodesSeen` / `containersResolved`.
- H2 — `scanForBlockedAuthors` enumeration (content.js:693-705):
  contribute `postsEnumerated` to the current scan event.
- H3 — `scheduleInitialScan`'s `doScan` (content.js:761-766) and the
  `MutationObserver` callback (content.js:1207-1217): these are the two
  scan-invocation clocks. The warm-up exclusion (section 2) is keyed to
  invocations observed at H3, so both entry paths share one clock.

## 2. Fire condition (N = 5, with warm-up + reset)

**Fire when, after warm-up, N = 5 consecutive qualifying scan events
occur, where a scan event is qualifying iff
`textNodesSeen > 0 && containersResolved == 0`** (matchable text
exists, but nothing resolved to a container).

- **Why this shape.** Requiring `textNodesSeen > 0` is what keeps
  clean pages quiet: a clean feed, an empty search page, or a
  non-feed page produces `textNodesSeen == 0` scans, which are
  **neutral** — they neither extend nor reset the streak. Only
  evidence of *unresolvable matches* extends it. This distinguishes
  "no posts" from "posts but no containers" without depending on
  `postsEnumerated` (see section 1 for why that counter cannot gate).
- **Why N = 5.** A cold LinkedIn load produces roughly: 1 initial scan
  (`scheduleInitialScan`, content.js:760-772, delayed by up to the 2000
  ms idle timeout or `INITIAL_SCAN_DELAY_MS` 1000 ms) + 2–3 mutation
  rounds as the feed hydrates (500 ms debounce each, content.js:1217).
  During hydration, partial batches can be transiently qualifying
  (text streamed in before sibling structure settles). A threshold at
  or below ~4 risks firing on every slow load; N = 5 sits one full
  debounce round above the worst normal cold-start sequence (~4),
  i.e. ≈ 2.5 s of sustained unresolvable-match scanning before a
  single `console.warn`.
- **Warm-up exclusion.** The first 3 scan invocations after navigation
  (or after re-enable / snooze expiry, which re-enter via
  `scheduleInitialScan` + `startObserver`, content.js:1195-1196) are
  excluded from the streak entirely — they cover the initial scan plus
  the first hydration rounds. Counting starts at invocation 4.
- **Reset (no latching).** Any scan event with
  `containersResolved > 0` resets the streak to 0. Neutral scans
  (`textNodesSeen == 0`) preserve the streak, so an empty search page
  mid-session neither fires nor wipes evidence. Snoozed/disabled
  scans never emit events (hooks sit after the `enabled`/snooze
  guards at content.js:667, 689, 716, 741, 1209).
- **Fire-once per streak.** While the streak stays ≥ 5 with no
  resolution, the signal fires exactly once until a reset occurs
  (no per-scan console spam).

## 3. Where the signal goes (console-only)

**Recommendation: `console.warn`, exactly one line per drift episode.**
`console.warn` is the established diagnostic channel (no health
surface exists today) and it is maintainer-visible via user console
pastes with zero new machinery. The line carries the three counters
plus the streak length — counts only, never text.

Costing of the alternatives (rejected for this stage):

- Popup health line: needs a storage read on popup open, new locale
  keys in BOTH `_locales/en` + `_locales/es/messages.json`
  (smoke-enforced parity), and popup.js wiring — user-visible, so any
  false alarm trains users to ignore the popup. Too visible for an
  unproven signal with Risk: MED false-alarm rating.
- Options diagnostics section: same storage + locale costs, less
  visible than popup — but still persistent UI for a signal whose
  quietness is exactly what this spike must prove first.

Order is console-first, UI second — a build plan may propose the
popup/options surface only after a real-LinkedIn soak shows the
console signal quiet. At most one `chrome.storage.local` health flag
(name deferred — NO new `STORAGE_KEYS` entry in the spike) may back a
future UI; the spike itself writes nothing.

## 4. What the signal must never do

- Never influence `processed` / `forceShow` (content.js admission
  sets), block/hide/show decisions, cooldowns, badge text, counters,
  placeholders, or the missed-spam report flow.
- Never retain post text, URLs, author IDs, or any DOM content —
  the three counters above are the entire state (plus the streak
  integer and the fired flag).
- Never send network requests, request new permissions, or add
  storage keys in the spike. Observe-only is the entire safety case.
- Never repurpose the badge: badge text is a block count relay
  (background.js); health is meta — mixing them corrupts the stats
  joint-reset paths.

## 5. Quietness budget (falsifiable gate)

The full existing e2e suite (`tests/extension-smoke.js`,
`tests/extension-interactions.js`) plus the current mock feed
(`tests/helpers.js` `mockLinkedInFeed`: `spam-1` / `whitelisted-1` /
`clean-1` sections) must produce **ZERO fires** under this design.
Step 3 argues this per scenario class with file:line evidence; where
the argument is thin (debounce-timing races), the build plan must
include named browser proof instead of a tighter N — tuning N down
to fit observations is out of bounds (see STOP conditions).

Why the design is quiet by construction on the mock feed: `spam-1`
matches and resolves (reset, never streak); `whitelisted-1` matches
and still resolves (resolution at content.js:672 precedes the
whitelist check inside `blockPost`, so it also resets); `clean-1`
never matches (neutral scans). No sequence of these events can extend
the streak, at any N.
