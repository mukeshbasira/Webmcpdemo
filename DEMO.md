# The video — under 3 minutes

Hard rules from the challenge: **under 3:00**, public on YouTube, your own voice explaining it,
**no copyrighted music of any kind** (none at all is safest), no third-party trademarks beyond the
ChatGPT UI you are unavoidably filming.

Record at **1512×850 or wider** with the side panel legible. One site is on screen for the whole run:
`mcp-five-puce.vercel.app`.

---

## The arc

Seven beats, 2:40 in total — twenty seconds under the limit, which is the right side to be on. The first twenty seconds decide whether a judge on submission #140 keeps watching, so the
refusal goes first — it is the one thing no other entry will show.

### 0:00 — a page that says no (20s)

Open **Dad visits**. Ordinary living room, scores 90.

Ask the agent — or press **Watch a session** — to swing the sofa round to the door wall.

> **Say:** "Every WebMCP demo is a page that obeys. Watch this one refuse."

The exact call, if you are driving it by hand: `move_items({id: 'sofa', x: 0, y: 30, rot: 90})`.

It comes back `refused: true`, `moved: 0`. Nothing on the plan moves. The transcript reads
*"refused to move sofa — Sofa overlaps Armchair (chair_b)"*, and `because` carries the second reason
too: *"Sofa blocks the door (needs 90×90cm clear)"*. Read the door line out loud; it is the one a
floor plan cannot check for you. Alongside it is `instead` — real coordinates that break no rule.

You are in the **general** goal here, which is why the door wants 90cm and why a legal spot still
exists. Run the same call again after the next beat and the room has changed its mind: the door line
becomes *"needs 150×150cm clear"*, and `instead` is replaced by `least_bad`, because under
accessibility this room is too full for a legal sofa spot to exist at all.

> **Say:** "It didn't move the sofa and then complain. It declined, named the rule, and handed back
> somewhere that works. The page owns the geometry; the agent owns the intent."

### 0:20 — the tool list is the state (30s)

**Expand *Tools your agent can see* before you start rolling**, so the number is visible when it moves.

Say to the agent: **"My dad uses a wheelchair. Make this room work for him."**

- If the agent calls `brief()` first, the reply points at the word: *"wheelchair" is in who, but the
  goal is still "general"*. Nothing to say out loud — it is why the next call is reliable.
- `set_profile('accessibility')` → the tool count ticks up and **`access_check` appears**, glowing.
- Turning circles are drawn on the floor: green where a chair can turn, **red where it cannot**.
- The score falls **90 → 41**.

> **Say:** "The page just grew a tool that did not exist a second ago. That is `registerTool` with an
> AbortSignal and a `toolchange` event — the agent's tool list is the state of the room."

### 0:50 — sit in it (25s)

Agent calls `show({ eye: 'chair_b', eye_height: 115 })`.

The camera drops into that chair at wheelchair eye height and looks out.

> **Say:** "Not 'the route is 62 centimetres'. You are in the chair, looking at the thing in your way.
> That is an argument a floor plan cannot make."

### 1:15 — checked in public (20s)

Agent calls `say` with a `claim`. The bubble carries the sentence **and the page's verdict**:

The call: `say({text: "...", claim: {kind: 'gap', a: 'chair_a', b: 'table', value: 95}})`.

The agent claims the room is fine now. It is not:

> *"There is 95cm to the table — wide enough for a wheelchair."*
> **✗ not quite — the clear gap between Armchair and Coffee table is 65cm, not 95cm**

> **Say:** "The agent said a number out loud and the page checked it against its own geometry, in
> front of me. It cannot bluff to my face."

### 1:35 — a whole home, and the tools follow you (40s)

Back to the landing page. Press **2BHK · for 4**.

The flat draws: hall, two bedrooms, kitchen, bathroom, **with the walls between them**.

Walk through it — click the room chips along the top bar:

| Walk into | Watch the tool list |
|---|---|
| the **bathroom** | **`access_check` appears** — it set itself to accessibility, unasked |
| a **bedroom** with a bed | **`bedside_check` appears** — 60cm to get out on each side |
| the **kitchen**, add a hob | **`work_triangle` appears** — sink, hob, fridge, 360–660cm |

The point of the third row is that the tool *appears*. Call it right then and it answers "no sink,
fridge in this room yet" — which is the honest answer and a fine thing to read out, but if you want
the triangle itself on screen, add a sink and a fridge first, as the scripted session does.

> **Say:** "Nobody described these rooms to the agent. It found out where it was standing by reading
> its own tool list. That is the thing WebMCP does that a tool server cannot."

### 2:15 — what it is really about (15s)

Stay on the flat. Nothing new to click — this is the argument, over the thing you have just built.

> **Say:** "A room is the smallest honest example of a page holding a model the agent cannot see.
> The geometry is not in the DOM — no screenshot tells you a wheelchair needs 150 centimetres to turn."

### 2:30 — close (10s)

> **Say:** "Floor plans are just the example. Any page holding a model the agent cannot see —
> seating plans, warehouse racking, rosters — could hand it a search that only returns legal answers,
> and a page willing to say no."

---

## If the live agent misbehaves on the day

Every scene ships a **scripted session** — the same tool calls a real agent makes, run through the
same `window.room` entry point, on the real room. Press **Watch a session**.

Be straight about it on camera: *"this is the page running the calls itself, not a recording"* — the
transcript says so too. A judge who spots an unexplained script will not forgive it; one who is told
plainly will not care. Better still: film the live agent for beats 1–4 and use scripted sessions for
the flat, which is the longest sequence and the easiest to fumble.

## Checks before you hit record

- ChatGPT desktop, **GPT-5.6 Sol or Terra** (Luna has WebMCP off), Settings → Browser → Permissions →
  **Enable site tools**, on a **Work or Codex** workspace. The "Site tools" chip must be in the bar.
- Or Chrome 149+ with `chrome://flags/#enable-webmcp-testing`.
- **Clear this site's data first, or record in a fresh profile.** Two things on the landing page are
  stored in your browser and will be on screen in the opening frame if you have been testing: the
  *Pick up where you left off* card, dated and showing whatever room you last had open, and — inside
  a scene — the *this room remembers* panel, listing refusals from earlier sessions. Both are real
  features and worth showing deliberately; neither is what you want in the first shot, out of
  context, dated yesterday.
- Do not touch an automation button. There are none on the page as anyone will see it — the only
  ones that exist are the scripted sessions, and they announce themselves. (`?dev` adds two for
  development, an auto-arrange and a per-problem fix. Do not record with `?dev` in the URL.)
- Say the sentence "the page refuses" in the first twenty seconds. It is the title of the submission
  and the one line that separates this from every other 3D planner in the pile.
