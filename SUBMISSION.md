# WebMCP Challenge — submission

## Title
**ROOM — a web page that argues back**

## Live URL
https://mcp-five-puce.vercel.app/?preset=dad-visits

Open it in the **ChatGPT desktop app's built-in browser** (Settings → Browser → Permissions → *Enable site tools*, on GPT-5.6 Sol or Terra — Luna has WebMCP disabled), or in **Chrome 149+** with `chrome://flags/#enable-webmcp-testing`.

Then say: **“My dad uses a wheelchair. Make this room work for him.”**

## Repository
https://github.com/mukeshbasira/Webmcpdemo — MIT licensed (`LICENSE` in the repo root).

## Video
https://youtu.be/BXF_AZuoDZs — under 3 minutes.

## Description

Most WebMCP demos are a page that obeys. **ROOM is a page that refuses.** Ask it to put the sofa across the doorway and the call comes back `refused: true, moved: 0`. The furniture never moved. The page names the rule it would have broken and hands back coordinates that do work — or, if the room is too full for any to exist, the closest it can get and what each would cost. The agent can pass `force: true`, but only once the human has said so. A page that reports the damage after doing it is complying and complaining; this one declines.

That comes from a split. Agents are good at intent and bad at geometry: ask one to plan a room and it will confidently invent coordinates, because the numbers only exist on the page. ROOM inverts it — **the page owns every number and every judgement, the agent owns the intent.** `find_space` returns spots that break no rule; `arrange` aligns, spaces and turns a whole set in one call; `add_item` with no coordinates lets the page choose. The agent never guesses a position. It asks.

28 tools, 28 rules, and a test suite that breaks the page on purpose to check the tests notice. Three things here that a tool server cannot do:

### 1. The tool list is the agent's location

`define_flat({bedrooms: 2, people: 4})` builds a 2BHK — hall, two bedrooms, kitchen, bathroom, with the walls between them — works out who sleeps where, and gives each room the goal it is judged against. Then walk through it:

| Walk into | The agent's tools change |
|---|---|
| the **bathroom** | **gains `access_check`** — it set itself to accessibility, unasked |
| a **bedroom** with a bed | **gains `bedside_check`** — 60cm each side to get out, 90 under accessibility, or a double bed sleeps one |
| the **kitchen**, once it has a hob | **gains `work_triangle`** — sink, hob, fridge, 360–660cm |
| back out again | those unregister |

Nobody described these rooms to the agent. **It found out where it was standing by reading its own tool list.** `registerTool` with an `AbortSignal`, and `toolchange` when it moves. The same mechanism runs in a single room: switch the goal to accessibility and `access_check` appears, turning circles are drawn on the floor, and the score falls from 90 to 41.

### 2. The page can interrupt the agent

WebMCP is agent→page only. The one thing a page can do unprompted is *change its tool list* — so when the human rejects a move, ROOM registers a transient tool called `read_message_from_human` whose description **is** the message. The browser fires `toolchange`, the agent sees a new tool, calls it, and learns what the human just did. A page-to-agent channel built from the only primitive available.

### 3. The human can refuse, and the call blocks

WebMCP has no elicitation primitive — Chrome's docs list `requestUserInteraction()` as still in development — so ROOM builds one from what exists. `remove_item` without `keep:true` returns a `Promise` that does not resolve until a person clicks ✓ or ✗ on the plan. The agent is genuinely parked on a human decision, not polling for one. Five tools ask before they throw work away — delete, replace the room, build a home over one, reopen a save, load a scene — and none of them asks when there is nothing to lose. Ninety seconds of nobody being there is answered as *nobody answered*, never as a refusal, because telling an agent the human said no when they were making tea is inventing their decision. And a real refusal is remembered in `localStorage`, with the reason they gave, so the next agent that opens the room reads it before it starts.

### The rules are the other half

28 of them, filtered by goal, encoding lived experience rather than collision detection: a 10cm grid flood-fill that proves a 90cm corridor actually exists; sun angles per window per hour; the 3.5–10ft band where conversation is comfortable; a wardrobe's unfinished back; five desks welded into one 700cm run *"reads as a single shared table, not 5 places to work."* One of them is not about taste at all — `wet_zone` refuses a socket within 60cm of a bath, shower, basin or sink, under every profile, as an error.

Every violation carries its fix, so a rule you cannot satisfy is treated as a bug. That is why the catalogue has a blind.

And the page can put you inside it. `show({eye:'chair_b', eye_height:115})` drops the camera into that seat at wheelchair eye height, facing the way that person faces. Not *"the sofa narrows the route to 62cm"* — you are in the chair, looking at it.

### Four practical things

**It makes its case with no agent at all.** WebMCP needs a specific browser and setup, so every scene ships a scripted session: press *Watch a session* and the page runs the same calls a real agent makes, through the same `window.room` entry point the tools already expose. Nothing is faked — each step is a real tool call on the real room, narrated by the real transcript, and a test runs every step of every script on every commit.

**A plan you can hand to someone.** `plan_sheet` opens a dimensioned drawing — sizes in centimetres *and* feet-and-inches, a numbered schedule, overhead fixtures dashed the way a floor plan draws them, the problems still open. For a home it prints a cover with the whole floor plan and then a page per room. Ready to print or save as a PDF.

**The page itself is reachable.** A project arguing that somebody should be able to get around a room had better be usable without a mouse and without sight. Every control tabs, takes Enter and says what it is — including the ✓ and ✗ on a proposal and each room of a home, which are shapes in an SVG and had to be taught to behave like buttons. Both drawings carry `role="img"` and a sentence describing what they would tell you if you could see them; the transcript and the score are `aria-live`, because a page whose whole premise is telling you things was telling them silently.

**Nothing leaves the browser.** No account, no server, no analytics. Plans are shared by encoding the whole room into the URL.

### It is not really about furniture

A room is the smallest honest example of a page holding a model the agent cannot see. The geometry is not in the DOM, and no screenshot tells you that a wheelchair needs 150cm to turn or that 62cm is not a corridor. The same shape — page owns the model and the judgement, agent owns the intent — is waiting in seating plans, warehouse racking, stage rigs, PCB layout, rosters, planograms and planting plans. Each of them today gets an agent that reads the screen and proposes something plausible and wrong. Each could instead be handed a search that only returns legal answers, and a page willing to say no.

The furniture is the demo. The stance is the point.

## Against the WebMCP guidance

Chrome publishes a best-practices list and a set of character budgets. ROOM was built to them, and has a test that fails if it drifts:

- **One function per tool, no overlap**; verbs that distinguish doing from starting.
- **Natural language over ids** — `facing: 'window'`, `units: 'ft'`, never `shipping_id: 1`.
- **"Validate strictly in code, loosely in schema."** The schemas are permissive; the store is not. Every write funnels through one clamp, so `add_item({x: NaN})`, `rot: 45`, an outlet dropped mid-floor and a door hung off the end of a wall are all corrected rather than rejected — the agent self-corrects instead of erroring out.
- **Contextual registration** — tools appear and disappear with the state of the room, via `AbortController` + `toolchange`.
- **Evaluation-driven development.** `baseline` runs the page's own arranger so the agent can score itself against a known number. It is a real opponent: it clears the pile scene from 69 to 100 on its own. But it is greedy and it knows nothing about the human, so the moment it replaces a layout somebody actually thought about it comes out behind — and says so out loud rather than banking the lower number: *"it is WORSE than what was here (95 → 90) — undo() puts the old layout back, and beating 95 is the real bar."* A baseline that always loses is not a baseline.
- **Tests that are themselves tested.** A passing suite proves nothing on its own — six of these had quietly stopped asserting anything and stayed green the whole time. So `npm run mutate` breaks the page on purpose — a wheelchair turns in a smaller circle, the page stops refusing, silence gets reported as a refusal — and every one of those has to turn the suite red.
- **The arguments an agent really sends.** Not just junk. Metres where centimetres were meant, an id carrying the capital the model read off the label, a number in quotes, "couch" for a sofa. Each one used to cost a turn or, worse, be silently misread: `x: 1.5` put the sofa in the corner and then refused for an *overlap*, so the agent was told the room was full when the problem was the unit.
- **Annotations, honestly set.** `readOnlyHint` on the ten tools that only read, `untrustedContentHint` on the seven that can hand back text a human typed, `destructiveHint` on the seven that replace rather than add. A client that skips its confirmation prompt on a read-only tool is trusting that flag, so every one of them was checked against what the tool actually does rather than against what it is called.
- **The budgets.** All 28 tool descriptions are under 500 characters, every parameter under 150, and the static reference blocks — catalogue, rule list, fixture glossary — are taught once per session instead of on every call, which cut about 1.2 K of repeated context off every `get_room` and `sense_room`.

That last one is not cosmetic. A planner is a long conversation, and anything resent every turn is paid for every turn.

### How it was built

Day one was a 25-line spike (`spike.html`, still in the repo) that answered the only question that mattered: which API exists in the wild, does late registration fire `toolchange`, what shape does `executeTool` accept. Everything after was built against those answers rather than the docs — Chrome 152 puts the API on `document.modelContext`, not `navigator`, and passes tool arguments as JSON *strings*, which the schemas cannot assume away. The geometry core (collision, walkway flood-fill, door swings, solar position) has no framework in it at all; React only draws what the store already decided.

### Challenges

The hardest bugs were never crashes — they were sentences. A tool that said "no legal spot exists" after checking 40 of 380 candidates. A score that rewarded emptying the room over solving it, so a well-behaved agent threw the human's furniture out and reported success. A verdict that printed "75cm" two lines above a rule that said 60. Each one made the *agent* look stupid, and each one was the page. The fix was a discipline: read every reply the way an agent receives it, and break the page on purpose (`npm run mutate`) to prove the tests would notice.

### What I learned

An agent optimises exactly what you score, advises what you suggest, and inherits every ambiguity you leave in a description. If the page's numbers make the wrong thing cheap, the agent will do the wrong thing fluently — so the real work of a WebMCP page is not exposing tools, it is being honest in centimetres.

## Built with
Vite · React 19 · TypeScript · Tailwind v4 · three.js · vitest · deployed on Vercel
