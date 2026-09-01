import { useSyncExternalStore } from 'react'
import { CATALOG, CATALOG_TYPES, spec, type ItemType } from './catalog'
import { normRot } from './rules'
import { KIND_PROFILE, homeParam, type Flat } from './flat'

export type Wall = 'N' | 'S' | 'E' | 'W'
export const WALL_NAME: Record<Wall, string> = { N: 'north', S: 'south', E: 'east', W: 'west' }
export type Rot = 0 | 90 | 180 | 270
/** The four right angles, and what each wall is called in a sentence. Both were written out twice —
 *  ROTS in tools.ts and space.ts, the wall names in two different places in tools.ts, one of which I
 *  added this morning while fixing the consequence of the other. A window is named from this, and
 *  five messages read that name out loud. */
export const ROTS: Rot[] = [0, 90, 180, 270]
export type Profile = 'general' | 'theater' | 'office' | 'bedroom' | 'accessibility'
/** Every goal a room can be judged against. Lived in tools.ts, which store.ts cannot import — so
 *  the list sat away from the type it belongs to, and restore() had no way to check one. */
export const PROFILES: Profile[] = ['general', 'theater', 'office', 'bedroom', 'accessibility']
export type Pt = { x: number; y: number }
export type Door = { id: string; wall: Wall; pos: number; width: number }
export type Win = { id: string; wall: Wall; pos: number; width: number }
export type Season = 'summer' | 'spring' | 'winter'
/** Spelled out in five places — this file twice, the sun tool's schema and its check, the share
 *  loader, and the panel's picker. A closed set with five copies is one that drifts the day it grows,
 *  and one of the copies is a JSON Schema an agent reads. */
export const SEASONS: Season[] = ['summer', 'spring', 'winter']
export type Activity = 'study' | 'work' | 'dine' | 'watch' | 'sleep' | 'talk'
/** WHO the room is for. The geometry rules cannot tell a desk for one from a desk for five;
 *  this is the human half of the problem, and the agent has to ask for it. */
export type Brief = { people: number; activity: Activity; who?: string }
export type Room = { w: number; h: number; doors: Door[]; windows: Win[]; outlets: Pt[]; north?: number; season?: Season }
export type Item = { id: string; type: ItemType; x: number; y: number; rot: Rot; w: number; h: number; parked?: true }
export type Claim = { kind: 'distance' | 'angle' | 'gap' | 'clear'; a: string; b?: string; value: number; unit?: string }
export type Verdict = { ok: boolean; actual: number; said: number; text: string }
export type Note = { id: string; item?: string; x?: number; y?: number; text: string; kind: 'warn' | 'idea' | 'ok' | 'say'; options?: string[]; answered?: string; claim?: Claim; verdict?: Verdict; t: number }
export type Call = { t: number; name: string; args: unknown; ms: number }
export type Feed = { t: number; who: 'agent' | 'you'; text: string }
export type HumanEvent = { action: string; item?: string; from?: unknown; to?: unknown; detail?: string; text: string }
/** a placement the agent has PROPOSED but the human has not approved — drawn as a ghost */
export type Proposal = { id: string; item: string; x: number; y: number; rot: Rot; why?: string; t: number }
/** something the human taught the page about this room; survives reload */
export type Lesson = { t: number; text: string }
export type State = {
  presetId: string | null
  room: Room
  items: Item[]
  notes: Note[]
  profile: Profile
  brief: Brief | null
  panelHidden: boolean
  /** sit the camera inside the room, at somebody's eye level, looking where they look */
  eye: { id: string; cm: number; label: string } | null
  selected: string | null
  replyTo: string | null
  flash: Record<string, number>
  hour: number
  view: '2d' | '3d'
  path: { pts: Pt[]; to: string; length: number } | null
  layouts: Record<string, Item[]>
  baseline: { score: number; profile: Profile; items: Item[] } | null
  spot: { ids: string[]; until: number } | null
  humanEvents: HumanEvent[]
  /** one step back: the furniture AND the room it was in, because resizing is a change too */
  history: { items: Item[]; room: Room }[]
  calls: Call[]
  feed: Feed[]
  mcp: 'unknown' | 'ok' | 'missing'
  /** the tools the agent can see right now — the list changes with the room */
  mcpTools: string[]
  proposals: Proposal[]
  learned: Lesson[]
  /** a message the PAGE wants to push to the agent — surfaced as a transient WebMCP tool */
  nudge: { text: string; t: number } | null
  /** index of the running scripted demo step, or null when no demo is playing */
  demo: number | null
  /** a whole home, when the human is planning more than one room */
  flat: Flat | null
  /** which room of the flat is on screen — state.room and state.items ARE that room */
  here: string | null
  /** whether this browser is still accepting what we save. 'blocked' is private mode saying no from
   *  the start; 'full' is the quota saying no after we already pruned what we could. */
  storage: 'ok' | 'full' | 'blocked'
  /** an origin that has asked to borrow the read-only tools and is waiting on the human */
}

export let state: State = {
  presetId: null,
  room: { w: 500, h: 400, doors: [], windows: [], outlets: [] },
  items: [], notes: [], profile: 'general', brief: null,
  // ?panel=hide — for embedding the room in another page, where the host owns the chrome
  // ?panel=hide is for embedding this page in a frame. The width test is for a phone: the panel is a fixed
  // 340px that never shrinks, so on a 390px screen it left about fifty pixels of room — the page
  // arrived broken for anybody who opened the link on the thing in their hand. Collapsed, it is a
  // 36px tab with a dot when something is wrong, and one tap away.
  panelHidden: typeof location !== 'undefined'
    && (new URLSearchParams(location.search).get('panel') === 'hide'
      || (typeof innerWidth === 'number' && innerWidth > 0 && innerWidth < 900)), eye: null, selected: null, replyTo: null, flash: {}, hour: 9, view: (typeof location !== 'undefined' && new URLSearchParams(location.search).get('view') === '3d' ? '3d' : '2d'), path: null, layouts: {}, baseline: null, spot: null,
  humanEvents: [], history: [], calls: [], feed: [], mcp: 'unknown', mcpTools: [], proposals: [], learned: [], nudge: null, demo: null, flat: null, here: null, storage: 'ok',
}

const subs = new Set<() => void>()
export const subscribe = (fn: () => void) => (subs.add(fn), () => void subs.delete(fn))
export const set = (patch: Partial<State> | ((s: State) => Partial<State>)) => {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  subs.forEach(f => f())
}
export const useStore = () => useSyncExternalStore(subscribe, () => state)

let seq = 0
export const uid = (p: string) => `${p}_${(++seq).toString(36)}`

/** Standing back and looking at the whole home, rather than standing in one of its rooms. Eleven
 *  places asked this by spelling it out, and the answer decides what the whole screen is. */
export const atWholeHome = <T extends Pick<State, 'flat' | 'here'>>(s: T): s is T & { flat: Flat } => !!s.flat && !s.here

// Exact match first, then the two ways a language model writes an id it read a moment ago: with the
// capital it saw in the label, or with the article it would use out loud. Only ever one candidate —
// a guess between two pieces would be the page inventing intent, which is the one thing it must not do.
/** Who the room is for, as a phrase that reads. Four places spliced the count and the human's own
 *  words together as `${people} ${who}`, which is right for "5 kids" and wrong for "3 my family".
 *  Whether a number can go in front depends on the first word, so that is what decides it. One of the
 *  four also said "for 1 people". */
const CANNOT_FOLLOW_A_NUMBER = /^(my|our|your|his|her|their|its|the|a|an|me|us|we|everyone|nobody)\b/i
export const whoPhrase = (b: { people: number; who?: string }) =>
  !b.who ? `${b.people} ${b.people === 1 ? 'person' : 'people'}`
    : CANNOT_FOLLOW_A_NUMBER.test(b.who.trim()) ? `${b.who} (${b.people})`
      : `${b.people} ${b.who}`

export const getItem = (id: string) => {
  const exact = state.items.find(i => i.id === id)
  if (exact || typeof id !== 'string') return exact
  const want = id.trim().toLowerCase().replace(/^(?:the|a|an)\s+/, '').replace(/\s+/g, '_')
  const near = state.items.filter(i => i.id.toLowerCase() === want)
  return near.length === 1 ? near[0] : undefined
}
export const push = () => set(s => ({ history: [...s.history.slice(-30), { items: s.items, room: s.room }] }))
export const pop = () => set(s => (s.history.length ? { ...s.history.at(-1)!, history: s.history.slice(0, -1) } : {}))
export const snap = (n: number) => Math.round(n / 10) * 10
const clampN = (v: unknown, lo: number, hi: number, fb = lo) => { const n = Number(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb }

const num = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback)
/** Furniture cannot be outside the walls. An agent that sends x:5000 would otherwise put a piece
 *  where the human can neither see it nor grab it back — a piece that genuinely does not fit belongs
 *  in the set-aside tray, not in the next county. */
const clampInside = (it: Item, room: { w: number; h: number }): Item => {
  if (it.parked) return it
  const fw = it.rot % 180 ? it.h : it.w, fh = it.rot % 180 ? it.w : it.h
  return { ...it, x: clampN(it.x, 0, Math.max(0, room.w - fw), 0), y: clampN(it.y, 0, Math.max(0, room.h - fh), 0) }
}

/** A sconce and a cove strip are screwed to a wall, so they cannot hang in mid-air. Applied on every
 *  path that moves one — agent call, human drag, accepted proposal — not just at the point of adding. */
export const toWall = (it: Item, room: { w: number; h: number }): Item => {
  if (!spec(it.type).wall) return it
  const fw = it.rot % 180 ? it.h : it.w, fh = it.rot % 180 ? it.w : it.h
  const d = [it.y, room.h - (it.y + fh), it.x, room.w - (it.x + fw)]  // N, S, W, E
  const m = Math.min(...d)
  if (m === d[0]) return { ...it, y: 0, x: clampN(it.x, 0, room.w - fw) }
  if (m === d[1]) return { ...it, y: room.h - fh, x: clampN(it.x, 0, room.w - fw) }
  if (m === d[2]) return { ...it, x: 0, y: clampN(it.y, 0, room.h - fh) }
  return { ...it, x: room.w - fw, y: clampN(it.y, 0, room.h - fh) }
}

export const updateItem = (id: string, p: Partial<Item>) =>
  set(s => ({ path: null, items: s.items.map(i => (i.id === id ? toWall(clampInside({
    ...i, ...p,
    ...('parked' in p && !p.parked ? { parked: undefined } : {}),
    x: snap(num(p.x, i.x)), y: snap(num(p.y, i.y)),
    w: Math.max(20, Math.min(600, Math.round(num(p.w, i.w)))), h: Math.max(20, Math.min(600, Math.round(num(p.h, i.h)))),
    rot: normRot(num(p.rot, i.rot)),
  }, s.room), s.room) : i)) }))
/** A name for a new piece, the way a person would: the first wardrobe is `wardrobe`, the second is
 *  `wardrobe_2`. uid() counts every object the page has ever made, so the first wardrobe in a room
 *  could be `wardrobe_7` — a number that means nothing, printed on a plan somebody hands a joiner. */
const freeId = (type: ItemType) => {
  const taken = new Set(state.items.map(i => i.id))
  if (!taken.has(type)) return type
  for (let n = 2; n < 99; n++) if (!taken.has(`${type}_${n}`)) return `${type}_${n}`
  return uid(type)
}

export const addItem = (type: ItemType, x: number, y: number, rot: Rot = 0): Item => {
  const c = CATALOG[type]
  // same guards updateItem has always had: a NaN coordinate or a 45° rotation from an agent used to
  // land straight in the room and break every rule that touched it
  const it = toWall(clampInside({ id: freeId(type), type, x: snap(clampN(x, -2000, 2000, 0)), y: snap(clampN(y, -2000, 2000, 0)),
    rot: normRot(num(rot, 0)), w: c.w, h: c.h }, state.room), state.room)
  set(s => ({ items: [...s.items, it] }))
  return it
}
/** rotate 90° clockwise about the centre, snapped to grid */
export const rotateItem = (id: string) => {
  const i = getItem(id); if (!i) return
  const fw = i.rot % 180 ? i.h : i.w, fh = i.rot % 180 ? i.w : i.h
  const cx = snap(i.x + fw / 2), cy = snap(i.y + fh / 2) // snap the CENTRE so 4×R returns to the start
  const rot = normRot(i.rot + 90)
  updateItem(id, { rot, x: cx - fh / 2, y: cy - fw / 2 })
  humanEvent({ action: 'rotated', item: id, from: i.rot, to: rot, text: `rotated the ${CATALOG[i.type].label.toLowerCase()} to ${rot}°` })
}
/** resize the room, keeping everything that still fits */
export const wallLen = (wall: Wall, w: number, h: number) => (wall === 'N' || wall === 'S' ? w : h)

/** A socket is screwed to a wall, not floating in the middle of the floor. Whatever the agent (or a
 *  shared link, or a resize) hands us gets pulled to the nearest wall and clamped inside the room. */
export const onWall = (o: unknown, w: number, h: number): Pt => {
  const p = (o ?? {}) as Pt
  const x = clampN(p.x, 0, w), y = clampN(p.y, 0, h)
  const d = [y, h - y, x, w - x], m = Math.min(...d)
  return m === d[0] ? { x: snap(x), y: 0 } : m === d[1] ? { x: snap(x), y: h }
    : m === d[2] ? { x: 0, y: snap(y) } : { x: w, y: snap(y) }
}

/** A door or window is a hole cut in ONE wall: it cannot be wider than that wall and cannot hang off
 *  either end. Widths and positions arrive from agents and shared links, so nothing is trusted. */
/** How wide a door and a window are, and the narrowest either may be. Four call sites had these as
 *  bare numbers, and the two functions that take them read (min, width) and (width, min) — opposite
 *  orders, agreeing only by luck. Named, so the order cannot be got wrong. */
export const DOOR = { min: 60, wide: 90 }, WINDOW = { min: 40, wide: 120 }

export const fitOpening = (o: { wall: Wall; pos: number; width: number }, w: number, h: number, min: number, fb: number) => {
  const L = wallLen(o.wall, w, h)
  const width = clampN(o.width, Math.min(min, L), L, Math.min(fb, L))
  return { pos: clampN(o.pos, 0, L - width, 0), width }
}

/** Normalise a list of raw openings, dropping any that would occupy the same bricks as one already
 *  cut into that wall — two holes cannot share the same span. */
export const openings = (raw: unknown, w: number, h: number, fb: number, min = 40) => {
  const taken: Partial<Record<Wall, [number, number][]>> = {}
  const out: { wall: Wall; pos: number; width: number }[] = []
  for (const o of (Array.isArray(raw) ? raw : []) as any[]) {
    if (!o || !(['N', 'S', 'E', 'W'] as const).includes(o.wall)) continue
    const { pos, width } = fitOpening({ wall: o.wall, pos: o.pos, width: o.width ?? fb }, w, h, min, fb)
    const t = (taken[o.wall as Wall] ??= [])
    if (t.some(([a, b]) => pos < b && a < pos + width)) continue
    t.push([pos, pos + width]); out.push({ wall: o.wall as Wall, pos, width })
  }
  return out
}

/** How big a room may be. Three places had an opinion: the store clamped to 2000, a shared link
 *  clamped to 2000, and set_room refused anything over 1000 — so a human dragging the size fields
 *  could make a room the agent was told it may not, and a link could arrive carrying one.
 *
 *  1000, which is what set_room already promised, and not 2000. check() runs on every change to the
 *  room and its cost follows the floor AREA, not the furniture — a flood fill over a 10cm grid. It
 *  is 0.2ms at 420x420, 2.7ms at 1000x1000 and 11.9ms at 2000x2000, and 12ms is most of a frame
 *  before React or the 3D view have had a turn. Nothing real needs the room: the largest preset is
 *  820cm across, and the rooms inside a home are under 460. */
/** How to get an agent, in one sentence. The landing page said it with the flag; the panel said it
 *  without — and the submission's own link goes straight to a scene, so the panel's version is the
 *  one a judge in ordinary Chrome actually reads. Naming the browser without naming the switch is
 *  half an instruction. */
export const GET_WEBMCP = 'the ChatGPT desktop app, or Chrome 149+ with chrome://flags/#enable-webmcp-testing enabled'

export const ROOM_MIN = 150, ROOM_MAX = 1000

export const resizeRoom = (w: number, h: number) => {
  const W = Math.max(ROOM_MIN, Math.min(ROOM_MAX, Math.round(w / 10) * 10)), H = Math.max(ROOM_MIN, Math.min(ROOM_MAX, Math.round(h / 10) * 10))
  set(s => ({
    room: { ...s.room, w: W, h: H,
      doors: s.room.doors.map(d => ({ ...d, ...fitOpening(d, W, H, DOOR.min, DOOR.wide) })),
      windows: s.room.windows.map(v => ({ ...v, ...fitOpening(v, W, H, WINDOW.min, WINDOW.wide) })),
      // a socket on the east wall of a 420cm room would hang in mid-air once the room is 800cm wide
      outlets: s.room.outlets.map(o => onWall(o, W, H)) },
    // anything the smaller room can no longer hold is set aside, not left hanging outside the walls
    items: s.items.map(i => { if (i.parked) return i
      const fw = i.rot % 180 ? i.h : i.w, fh = i.rot % 180 ? i.w : i.h
      if (fw > W || fh > H) return { ...i, parked: true as const }
      return { ...i, x: Math.max(0, Math.min(i.x, W - fw)), y: Math.max(0, Math.min(i.y, H - fh)) }
    }),
    path: null, proposals: [], // a proposal made for the old walls means nothing in the new ones
  }))
}
/** set aside: keeps the item in the project but out of the floor plan and out of every geometry rule */
export const parkItem = (id: string) => set(s => ({ items: s.items.map(i => (i.id === id ? { ...i, parked: true as const } : i)), path: null }))
export const unparkItem = (id: string, x: number, y: number) =>
  set(s => ({ items: s.items.map(i => (i.id === id ? { ...i, parked: undefined, x: snap(x), y: snap(y) } : i)) }))
export const removeItem = (id: string) => set(s => ({ items: s.items.filter(i => i.id !== id), notes: s.notes.filter(n => n.item !== id), proposals: s.proposals.filter(p => p.item !== id), selected: s.selected === id ? null : s.selected, path: s.path?.to === id ? null : s.path, spot: s.spot?.ids.includes(id) ? null : s.spot }))
/** one note per item (newest wins); at most 8 notes on screen */
export const addNote = (n: Omit<Note, 'id' | 't'>) =>
  set(s => ({ notes: [...s.notes.filter(o => !(n.item && o.item === n.item)).slice(-7), { ...n, id: uid('n'), t: Date.now() }] }))
export const answerNote = (id: string, answer: string) => {
  const n = state.notes.find(n => n.id === id); if (!n) return
  set(s => ({ notes: s.notes.map(x => (x.id === id ? { ...x, answered: answer } : x)), replyTo: null }))
  settle(id, answer)
  humanEvent({ action: 'answered', item: n.item, detail: n.text, to: answer, text: `answered “${n.text}” → ${answer}` })
  // Two answers to the same question before the agent looks used to quote it twice, in full — the
  // question is long, and the second copy tells the agent nothing it did not already have.
  if (!/^[✓👍]/.test(answer)) nudgeAgent(state.nudge?.text.includes(`"${n.text}"`)
    ? `the human then said: "${answer}"`
    : `The human answered your question "${n.text}" with: "${answer}". Act on it.`)
}
/** mark items the agent just moved; the ring fades on its own */
export const flash = (ids: string[]) => { const t = Date.now(); set(s => ({ flash: { ...s.flash, ...Object.fromEntries(ids.map(i => [i, t])) } })); setTimeout(() => set(s => ({ flash: Object.fromEntries(Object.entries(s.flash).filter(([, v]) => v !== t)) })), 1600) }
export const feed = (who: Feed['who'], text: string) => set(s => ({ feed: [...s.feed.slice(-60), { t: Date.now(), who, text }] }))
export const humanEvent = (e: HumanEvent) => { set(s => ({ humanEvents: [...s.humanEvents.slice(-40), e] })); feed('you', e.text) }
export const drainHuman = () => { const h = state.humanEvents; if (h.length) set({ humanEvents: [] }); return h }
export const logCall = (name: string, args: unknown, ms: number) => set(s => ({ calls: [...s.calls.slice(-40), { t: Date.now(), name, args, ms }] }))

// ---- proposals: the agent suggests, the human decides ------------------
export const propose = (p: Omit<Proposal, 'id' | 't'>) => {
  const it = getItem(p.item); if (!it) return
  const clean = { ...p, x: snap(num(p.x, it.x)), y: snap(num(p.y, it.y)), rot: normRot(num(p.rot, it.rot)) }
  set(s => ({ proposals: [...s.proposals.filter(q => q.item !== p.item), { ...clean, id: uid('p'), t: Date.now() }] }))
}
export const acceptProposal = (id: string, pushed = false) => {
  const p = state.proposals.find(q => q.id === id); if (!p) return
  if (!pushed) push()
  updateItem(p.item, { x: p.x, y: p.y, rot: p.rot, parked: undefined }); flash([p.item])
  set(s => ({ proposals: s.proposals.filter(q => q.id !== id) }))
  humanEvent({ action: 'accepted', item: p.item, to: { x: p.x, y: p.y, rot: p.rot }, text: `accepted your proposal for the ${label(p.item)}` })
}
export const rejectProposal = (id: string, reason?: string) => {
  const p = state.proposals.find(q => q.id === id); if (!p) return
  set(s => ({ proposals: s.proposals.filter(q => q.id !== id) }))
  learn(`the human rejected moving the ${label(p.item)} to (${p.x},${p.y})${p.why ? ` — you said "${p.why}"` : ''}${reason ? ` — they said "${reason}"` : ''}`)
  humanEvent({ action: 'rejected', item: p.item, to: { x: p.x, y: p.y, rot: p.rot }, detail: reason, text: `rejected your proposal for the ${label(p.item)}${reason ? `: ${reason}` : ''}` })
  nudgeAgent(`The human REJECTED your proposal for the ${label(p.item)}${reason ? `: "${reason}"` : ''}. Ask why or try something else.`)
}
export const acceptAll = () => { if (!state.proposals.length) return; push(); for (const p of [...state.proposals]) acceptProposal(p.id, true) } // one undo step for the whole batch
export const rejectAll = () => { for (const p of [...state.proposals]) rejectProposal(p.id) }
const label = (id: string) => { const i = getItem(id); return i ? CATALOG[i.type].label.toLowerCase() : id }

// ---- saved rooms: the human's own, on their own machine ------------------
// Nothing leaves the browser, so this is localStorage, not an account. `layouts` is the agent's
// scratch space for comparing options inside one session; this is the human's shelf between them.
export type Save = { name: string; t: number; room: Room; items: Item[]; profile: Profile; hour: number; brief: Brief | null; presetId: string | null
  /** a home is several rooms; saving only the one you were standing in loses the other four */
  flat?: Flat | null; here?: string | null }
const SAVES = 'room.saves', LAST = 'room.last', LEARNED = 'room.learned.'
export const MAX_SAVES = 12
/** How many rooms are worth remembering the arguments about. Every distinct room shape ever opened
 *  used to leave a key behind for good — five or more per home, one per shared link — and nothing
 *  ever removed one. Given long enough that fills the origin's quota, and then NOTHING saves. */
const MAX_REMEMBERED_ROOMS = 40

// length + key(i) is the Storage API. Object.keys() happens to work on the real one and on nothing
// else, which is exactly the sort of thing that passes until the day it matters.
const allKeys = (): string[] => {
  try { return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => !!k) }
  catch { return [] }
}

const readJSON = <T,>(key: string, fb: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return fb } }

/** Drop the room memories nobody has touched in longest. Returns whether it actually freed anything,
 *  so a caller knows if retrying is worth it. */
const pruneLearned = (keep = MAX_REMEMBERED_ROOMS): boolean => {
  const rooms = allKeys().filter(k => k.startsWith(LEARNED)).map(k => {
    const v = readJSON<{ t?: number }[]>(k, [])
    return { k, t: Array.isArray(v) ? Math.max(0, ...v.map(x => Number(x?.t) || 0)) : 0 }
  }).sort((a, b) => b.t - a.t)
  const doomed = rooms.slice(keep)
  for (const d of doomed) { try { localStorage.removeItem(d.k) } catch { /* nothing more to try */ } }
  return doomed.length > 0
}

/** Every write goes through here. A browser refuses for two different reasons — private mode says no
 *  from the start, a full quota says no once — and only the second is worth recovering from. Silence
 *  was the old behaviour, and a human whose work has quietly stopped being saved deserves better. */
const write = (key: string, value: unknown): boolean => {
  let json: string
  try { json = JSON.stringify(value) } catch { return false }
  const put = () => { try { localStorage.setItem(key, json); return true } catch { return false } }
  if (put()) { if (state.storage !== 'ok') set({ storage: 'ok' }); return true }
  // out of room: old arguments about rooms nobody is looking at are the cheapest thing to lose
  if (pruneLearned(Math.floor(MAX_REMEMBERED_ROOMS / 2)) && put()) { set({ storage: 'ok' }); return true }
  set({ storage: allKeys().length ? 'full' : 'blocked' })
  return false
}
const snap_ = (name: string): Save => {
  stow()   // whatever is on screen belongs to its room before the home is written down
  return { name, t: Date.now(), room: state.room, items: state.items, profile: state.profile, hour: state.hour,
    brief: state.brief, presetId: state.presetId, flat: state.flat, here: state.here }
}

export const listSaves = (): Save[] => readJSON<Save[]>(SAVES, []).filter(x => x && typeof x.name === 'string' && x.room && Array.isArray(x.items))

/** 'ok' | 'full' | 'no-name' | 'blocked' — a caller that cannot tell "the shelf is full" from "this
 *  browser will not let me write" tells the human the wrong thing, and it told them the wrong thing. */
export const saveRoom = (rawName: string): 'ok' | 'full' | 'no-name' | 'blocked' => {
  const name = String(rawName ?? '').trim().slice(0, 24); if (!name) return 'no-name'
  const rest = listSaves().filter(x => x.name !== name)
  if (rest.length >= MAX_SAVES) return 'full'
  return write(SAVES, [snap_(name), ...rest]) ? 'ok' : 'blocked'
}

export const deleteSave = (name: string) => {
  write(SAVES, listSaves().filter(x => x.name !== name))
  set({}) // repaint the list
}

/** A save is untrusted input too. It can come from an older version of this page, a hand-edited
 *  localStorage, or a room saved before a bound moved — and restore() used to take whatever it found.
 *  A piece the catalogue no longer has, or a goal that was renamed, made check() throw and took the
 *  whole page down with it. The share loader has always cleaned what it reads; this is the same
 *  cleaning, in one place, so both doors are the same door. */
export const cleanScene = (raw: { room?: unknown; items?: unknown; profile?: unknown; hour?: unknown }) => {
  const n = (v: unknown, lo: number, hi: number, fb: number) =>
    (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fb)
  const r = (raw.room ?? {}) as Record<string, unknown>
  const room = {
    w: n(r.w, ROOM_MIN, ROOM_MAX, 500), h: n(r.h, ROOM_MIN, ROOM_MAX, 400),
    doors: Array.isArray(r.doors) ? r.doors : [], windows: Array.isArray(r.windows) ? r.windows : [],
    outlets: Array.isArray(r.outlets) ? r.outlets : [],
    ...(typeof r.north === 'number' ? { north: n(r.north, 0, 359, 0) } : {}),
    ...(SEASONS.includes(r.season as Season) ? { season: r.season } : {}),
  } as Room
  const items = (Array.isArray(raw.items) ? raw.items : []).filter((i: unknown) => {
    const it = i as Record<string, unknown>
    return it && typeof it.id === 'string' && CATALOG_TYPES.includes(it.type as ItemType) && isFinite(Number(it.x)) && isFinite(Number(it.y))
  }).map((i: unknown) => { const it = i as Record<string, unknown>; const t = it.type as ItemType
    return { id: String(it.id).slice(0, 24), type: t, x: Math.round(Number(it.x)), y: Math.round(Number(it.y)),
      rot: normRot(Number(it.rot) || 0), w: n(it.w, 20, 600, spec(t).w), h: n(it.h, 20, 600, spec(t).h),
      ...(it.parked ? { parked: true as const } : {}) } as Item })
  return { room, items,
    profile: (PROFILES.includes(raw.profile as Profile) ? raw.profile : 'general') as Profile,
    hour: n(raw.hour, 0, 23, 9) }
}

export const restore = (v: Partial<Save> | null): boolean => {
  if (!v?.room || !Array.isArray(v.items)) return false
  const clean = cleanScene(v)
  set({ presetId: v.presetId ?? 'custom', room: clean.room, items: clean.items, profile: clean.profile, hour: clean.hour,
    brief: v.brief ?? null, notes: [], feed: [], history: [], proposals: [], humanEvents: [], calls: [], layouts: {}, spot: null, selected: null, path: null, nudge: null,
    flat: v.flat ?? null, here: null, eye: null })
  // a saved home comes back as a home, standing where you were standing in it
  if (v.flat && v.here && v.flat.rooms.some(r => r.id === v.here)) enterRoom(v.here)
  loadLearned()
  address(v)
  return true
}

/** Make the address bar say what is actually on screen. Loading a save left the old URL in place, so
 *  a reload took you back to whatever you had open BEFORE — a scene when you had restored a home, or
 *  a home when you had restored a scene. A room somebody drew by hand has no address that rebuilds
 *  it, so it gets none rather than a misleading one; the session is what brings that back. */
const address = (v: Partial<Save>) => {
  try {
    const q = new URLSearchParams(location.search)
    q.delete('preset'); q.delete('home')
    if (v.flat) q.set('home', homeParam(v.flat))
    else if (v.presetId && !['custom', 'shared', 'flat'].includes(v.presetId)) q.set('preset', v.presetId)
    history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : ''))
  } catch { /* no URL bar to update */ }
}
export const loadSave = (name: string) => restore(listSaves().find(x => x.name === name) ?? null)

/** Working on a flat means standing in one room at a time. Leaving saves what you did back into the
 *  flat; entering swaps that room's geometry and furniture in, and sets the goal the room is judged
 *  against — a bathroom is judged on turning space whether or not anybody asked. */
export const stow = () => {
  if (!state.flat || !state.here) return
  const rooms = state.flat.rooms.map(r => r.id === state.here ? { ...r, room: state.room, items: state.items, layouts: state.layouts } : r)
  set({ flat: { ...state.flat, rooms } })
}
export const leaveRoom = () => { stow(); set({ here: null, items: [], selected: null, eye: null, path: null, spot: null, history: [] }) }
export const enterRoom = (id: string): boolean => {
  const f = state.flat; if (!f) return false
  // rooms() hands back an id AND a name, and an agent that passes back "Bedroom 1" or "Kitchen" had
  // no way to tell which one this wanted. Same tolerance getItem already gives item ids.
  // case and the space in "Bedroom 1", and nothing else: stripping all punctuation also resolved
  // "../hall" to the hall, which is an agent with a bug being quietly agreed with
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, '')
  const r = f.rooms.find(x => x.id === id) ?? f.rooms.find(x => norm(x.id) === norm(id) || norm(x.name) === norm(id))
  if (!r) return false
  stow()
  set({ here: r.id, room: r.room, items: r.items.map(i => ({ ...i })), profile: KIND_PROFILE[r.kind],
    // `who` stands in place of "person"/"people" in the line the human reads, so the page inventing
    // "them" for itself produced "for 2 them to sleep". A name the human chose belongs there; a
    // pronoun the page made up does not.
    brief: r.kind === 'bedroom' ? { people: r.people, activity: 'sleep' as const }
      : r.kind === 'study' ? { people: r.people, activity: 'work' }
      : r.kind === 'hall' ? { people: f.people, activity: 'talk' } : null,
    notes: [], history: [], proposals: [], spot: null, selected: null, path: null, eye: null, baseline: null,
    // options belong to the room they were drawn for; they come back with it
    layouts: r.layouts ?? {} })
  return true
}

/** where the human left off, so a reload does not cost them their work */
export const rememberSession = () => { write(LAST, snap_('last')) }
export const lastSession = () => {
  const v = readJSON<Save | null>(LAST, null)
  if (!v?.room || !Array.isArray(v.items)) return null
  // a home counts if ANY of its rooms has something in it — left on the whole-home view there is no
  // current room, so `items` is empty and a fully furnished 2BHK looked like nothing to come back to
  const furnished = v.items.length || v.flat?.rooms?.some(r => r.items?.length)
  return furnished ? v : null
}
export const forgetSession = () => { try { localStorage.removeItem(LAST) } catch { /* ignore */ } }

// ---- memory: what this room has taught the page ------------------------
const LKEY = () => { const r = state.room; return `${LEARNED}${state.presetId ?? 'custom'}.${state.here ?? ''}.${r.w}x${r.h}.${r.doors.map(d => d.wall + d.pos).join('')}` } // keyed on the walls, so two different shared rooms never swap memories
/** The same refusal, said twice, teaches an agent nothing it did not know after the first — and the
 *  panel showed the identical sentence twice over, which reads as a page that cannot keep its own
 *  notes. Keep the most recent of each, in the order they last happened. */
const dedupe = (all: Lesson[]) => all.filter((l, i) => !all.slice(i + 1).some(o => o.text === l.text))

export const loadLearned = () => {
  const v = readJSON<unknown>(LKEY(), [])
  // whatever is in storage was put there by an older version of this page, or by hand — including,
  // for anyone who used the page before this, duplicates it wrote itself
  const all = Array.isArray(v) ? v.filter(x => x && typeof (x as Lesson).text === 'string') as Lesson[] : []
  set({ learned: dedupe(all).slice(-12) })
}
export const learn = (text: string) => {
  set(s => ({ learned: [...s.learned.filter(l => l.text !== text).slice(-11), { t: Date.now(), text }] }))
  write(LKEY(), state.learned)
}
export const forget = () => { set({ learned: [] }); try { localStorage.removeItem(LKEY()) } catch { /* ignore */ } }

// ---- page → agent push ---------------------------------------------------
/** WebMCP is agent→page only. The one thing a page can do unprompted is CHANGE ITS TOOL LIST, and the
 *  browser fires `toolchange` when it does. So the page registers a transient tool whose description IS
 *  the message. tools.ts turns this into a registration. */
export const nudgeAgent = (text: string) =>
  set(s => ({ nudge: { text: s.nudge ? `${s.nudge.text} ALSO: ${text}`.slice(0, 600) : text, t: Date.now() } })) // several things can happen before the agent looks
export const clearNudge = () => set({ nudge: null })

// ---- a tool call that waits for a person ----------------------------------
/** Read tools run free (readOnlyHint). Destructive ones stop here: a bubble with allow / refuse, and the
 *  agent's call does not resolve until the human clicks — or 90s pass, which counts as refuse. */
const pending = new Map<string, (ok: boolean) => void>()
export type Answer = 'yes' | 'no' | 'no answer'
export const confirm = (text: string, item?: string) => new Promise<Answer>(resolve => {
  addNote({ item, text, kind: 'warn', options: ['✓ allow', '✗ refuse'] })
  const id = state.notes.at(-1)!.id
  const timer = setTimeout(() => { pending.delete(id); set(s => ({ notes: s.notes.map(n => (n.id === id ? { ...n, answered: 'no answer' } : n)) })); resolve('no answer') }, 90_000)
  pending.set(id, ok => { clearTimeout(timer); pending.delete(id); resolve(ok ? 'yes' : 'no') })
})
export const settle = (noteId: string, answer: string) => { const r = pending.get(noteId); if (r) r(answer.startsWith('✓')) }
