import { spec, type ItemType } from './catalog'
import { whoPhrase } from './store'
import { fixture, isLight, needsLight } from './light'
import { DOCK, isDocked } from './dock'
import { sun, windowSun } from './sun'
import type { Activity, Brief, Item, Room, Profile, Rot, Wall, Win, Pt } from './store'

export type Rect = { x: number; y: number; w: number; h: number }
export type Rule = 'overlap' | 'out_of_bounds' | 'door_blocked' | 'walkway' | 'window_blocked' | 'viewing_distance' | 'glare' | 'outlet' | 'bed_clearance' | 'lighting'
  | 'viewing_angle' | 'traffic_crosses' | 'back_to_door' | 'bed_under_window' | 'dining_pullout' | 'rug_anchor' | 'wall_hug' | 'pairing' | 'doesnt_fit'
  | 'turning_circle' | 'reach_range' | 'back_to_wall' | 'plumbing' | 'per_person' | 'conversation' | 'entry_view' | 'proportion' | 'wet_zone'
export type Violation = { rule: Rule; items: string[]; severity: 'error' | 'warn'; msg: string; fix?: string; ref?: string }

export const RULE_LABEL: Record<Rule, string> = {
  overlap: 'No overlaps', out_of_bounds: 'Inside the room', door_blocked: 'Door swings free', walkway: 'Everything reachable',
  window_blocked: 'Windows not blocked', viewing_distance: 'Good viewing distance', glare: 'No window glare', outlet: 'Power within reach', bed_clearance: 'Space beside bed', lighting: 'Lit after dark',
  viewing_angle: 'Everyone faces the screen', traffic_crosses: 'Nobody walks through the view', back_to_door: 'Nobody sits back-to-door', bed_under_window: 'Bed off the window wall',
  dining_pullout: 'Chairs can pull out', rug_anchor: 'Rug anchors the seating', wall_hug: 'Furniture not all shoved to the walls', pairing: 'Pairs sit together', doesnt_fit: 'Everything fits',
  turning_circle: 'Room to turn a wheelchair', reach_range: 'Sockets within reach', back_to_wall: 'Tall pieces against a wall', plumbing: 'Fixtures reach a wall', per_person: 'Everyone has a place of their own', conversation: 'Close enough to talk', entry_view: 'You do not walk in behind the sofa',
  proportion: 'Pieces are in proportion', wet_zone: 'Sockets clear of water',
}

/** how far a plug reaches: an ordinary flex on an ordinary lamp */
export const REACH = 150

/** pieces whose back is unfinished, or whose cables or headboard need a wall behind them */
const BACKED: Partial<Record<ItemType, string>> = {
  wardrobe: 'an unfinished back, and it can topple',
  bookshelf: 'an unfinished back, and it can topple',
  tv_unit: 'cables that have to reach a wall',
  bed_double: 'a headboard that belongs against a wall',
  bed_single: 'a headboard that belongs against a wall',
}

/** A fixture with a pipe or a flue has to reach a wall: there is no plumbing in the middle of a floor
 *  slab. That is not taste, which is why it is an error rather than a warning — an agent that stood
 *  the toilet in the centre of the bathroom had drawn something nobody can install, and the page said
 *  nothing. Islands and freestanding fridges are real rooms, so a counter and a fridge are not here. */
export const PLUMBED: Partial<Record<ItemType, string>> = {
  toilet: 'a soil pipe', basin: 'a waste pipe', sink: 'a waste pipe',
  shower: 'a waste pipe and a feed', bathtub: 'a waste pipe and a feed', hob: 'an extractor and a gas or spur run',
}

const BASE: Rule[] = ['doesnt_fit', 'overlap', 'out_of_bounds', 'door_blocked', 'walkway', 'window_blocked', 'outlet', 'lighting', 'pairing', 'back_to_wall', 'plumbing', 'per_person', 'entry_view']
export const PROFILE_RULES: Record<Profile, Rule[]> = {
  general: [...BASE, 'wall_hug', 'dining_pullout', 'conversation', 'proportion', 'wet_zone'],
  theater: [...BASE, 'viewing_distance', 'viewing_angle', 'traffic_crosses', 'glare', 'rug_anchor', 'conversation', 'proportion', 'wet_zone'],
  office: [...BASE, 'glare', 'back_to_door', 'dining_pullout', 'wet_zone'],
  bedroom: [...BASE, 'bed_clearance', 'bed_under_window', 'back_to_door', 'dining_pullout', 'wet_zone'],
  accessibility: [...BASE, 'turning_circle', 'reach_range', 'dining_pullout', 'bed_clearance', 'wet_zone'],
}
export const minWalk = (p: Profile) => (p === 'accessibility' ? 90 : 60)
/** wheelchair turning circle, ISO 7193 / most national building codes */
export const TURN = 150
/** clear space beside a bed: enough to walk past, or enough to transfer out of a chair */
export const bedSide = (p: Profile) => (p === 'accessibility' ? 90 : 60)
/** clear ring round a dining table: pull a chair out, or roll a wheelchair up to it */
export const pullOut = (p: Profile) => (p === 'accessibility' ? 120 : 75)
/** the places a person actually goes — each one needs somewhere to turn */
/** Somewhere a person has to get to and use. A hardcoded list of living-room furniture meant a
 *  wheelchair audit in a bathroom found nothing to audit — which is the one room where it matters
 *  most. `use` is set in the catalogue on everything you stand at, sit on, open or wash in. */
export const isDestination = (t: ItemType) => !!(spec(t).seat || spec(t).bed || spec(t).screen || spec(t).use)
/** real solar geometry, respecting the room's compass orientation — see sun.ts */
export const sunlit = (wall: Wall, hour: number, room?: Room) => windowSun(wall, hour, room ?? { w: 500, h: 400, doors: [], windows: [], outlets: [] }) > 0.12

// ---- geometry ---------------------------------------------------------
export const footprint = (i: Item): Rect => (i.rot % 180 ? { x: i.x, y: i.y, w: i.h, h: i.w } : { x: i.x, y: i.y, w: i.w, h: i.h })
export const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
export const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
export const inside = (a: Rect, room: Room) => a.x >= 0 && a.y >= 0 && a.x + a.w <= room.w && a.y + a.h <= room.h
export const gap = (a: Rect, b: Rect) => {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w))
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h))
  return Math.hypot(dx, dy)
}
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
/** do segments p1p2 and p3p4 properly cross? */
export function segmentsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt) {
  const d = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}
/** front-facing unit vector: rot 0 faces S (+y), clockwise */
export const normRot = (r: number): Rot => ((((Math.round((Number(r) || 0) / 90) * 90) % 360) + 360) % 360) as Rot
export const front = (rot: Rot): Pt => ({ 0: { x: 0, y: 1 }, 90: { x: -1, y: 0 }, 180: { x: 0, y: -1 }, 270: { x: 1, y: 0 } })[normRot(rot)]

/** strip of depth d inside the room in front of a wall-mounted segment */
export const wallStrip = (room: Room, wall: Wall, pos: number, width: number, d: number): Rect =>
  wall === 'N' ? { x: pos, y: 0, w: width, h: d }
  : wall === 'S' ? { x: pos, y: room.h - d, w: width, h: d }
  : wall === 'W' ? { x: 0, y: pos, w: d, h: width }
  : { x: room.w - d, y: pos, w: d, h: width }
export const wallCenter = (room: Room, wall: Wall, pos: number, width: number): Pt =>
  wall === 'N' ? { x: pos + width / 2, y: 0 } : wall === 'S' ? { x: pos + width / 2, y: room.h }
  : wall === 'W' ? { x: 0, y: pos + width / 2 } : { x: room.w, y: pos + width / 2 }

export const doorClearance = (room: Room, d: Room['doors'][number], profile: Profile) => {
  // a wheelchair needs a 150cm turning circle: grow the clearance in BOTH axes, centred on the door
  const size = profile === 'accessibility' ? Math.max(d.width, 150) : d.width
  const along = (d.wall === 'N' || d.wall === 'S' ? room.w : room.h)
  const pos = Math.max(0, Math.min(along - size, d.pos - (size - d.width) / 2))
  return wallStrip(room, d.wall, pos, size, size)
}

// ---- walkway grid (10cm) ---------------------------------------------
const G = 10
export type Grid = { cols: number; rows: number; free: Uint8Array; reach: Uint8Array; parent: Int32Array }
export function walkGrid(room: Room, items: Item[], minWidth: number): Grid {
  const cols = Math.ceil(room.w / G), rows = Math.ceil(room.h / G)
  const occ = new Uint8Array(cols * rows)
  for (const it of items) {
    if (spec(it.type).passable) continue
    const f = footprint(it)
    for (let y = Math.max(0, Math.floor(f.y / G)); y < Math.min(rows, Math.ceil((f.y + f.h) / G)); y++)
      for (let x = Math.max(0, Math.floor(f.x / G)); x < Math.min(cols, Math.ceil((f.x + f.w) / G)); x++) occ[y * cols + x] = 1
  }
  // erosion: a cell is "free" if a k×k block starting there is unoccupied (k = corridor width)
  const k = Math.max(1, Math.round(minWidth / G))
  const free = new Uint8Array(cols * rows)
  for (let y = 0; y + k <= rows; y++) for (let x = 0; x + k <= cols; x++) {
    let ok = 1
    outer: for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) if (occ[(y + yy) * cols + x + xx]) { ok = 0; break outer }
    free[y * cols + x] = ok
  }
  // BFS from door cells
  const reach = new Uint8Array(cols * rows), parent = new Int32Array(cols * rows).fill(-1)
  const q: number[] = []
  for (const d of room.doors) {
    const s = wallStrip(room, d.wall, d.pos, d.width, G * k)
    for (let y = Math.floor(s.y / G); y < Math.ceil((s.y + s.h) / G); y++) for (let x = Math.floor(s.x / G); x < Math.ceil((s.x + s.w) / G); x++) {
      // snap block origin so it lies inside the room
      const bx = Math.min(x, cols - k), by = Math.min(y, rows - k)
      const idx = by * cols + bx
      if (free[idx] && !reach[idx]) { reach[idx] = 1; q.push(idx) }
    }
  }
  while (q.length) {
    const i = q.shift()!, x = i % cols, y = (i - x) / cols
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx + k > cols || ny + k > rows) continue
      const j = ny * cols + nx
      if (free[j] && !reach[j]) { reach[j] = 1; parent[j] = i; q.push(j) }
    }
  }
  return { cols, rows, free, reach, parent }
}
/** centre of the reachable k-block nearest the item, or null if it can't be reached at all.
 *  the centre is what lets the plan DRAW the clearance we just proved exists. */
const nearestBlock = (g: Grid, f: Rect, k: number): Pt | null => {
  const x0 = Math.floor(f.x / G) - k, x1 = Math.ceil((f.x + f.w) / G), y0 = Math.floor(f.y / G) - k, y1 = Math.ceil((f.y + f.h) / G)
  const c = center(f)
  let best: Pt | null = null, bd = Infinity
  for (let y = Math.max(0, y0); y <= Math.min(g.rows - k, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(g.cols - k, x1); x++) {
    if (!g.reach[y * g.cols + x]) continue
    const p = { x: x * G + (k * G) / 2, y: y * G + (k * G) / 2 }, d = dist(p, c)
    if (d < bd) { bd = d; best = p }
  }
  return best
}
const reachable = (g: Grid, f: Rect, k: number) => !!nearestBlock(g, f, k)

export type Turn = { item: string; label: string; x: number; y: number; r: number; ok: boolean }
/** For every destination, where a 150cm turning circle actually fits beside it — and where one doesn't.
 *  A wheelchair does NOT roll a 150cm square all the way from the door: it travels a 90cm corridor and
 *  turns where there is room. So the circle must FIT (150 erosion) and CONNECT to the 90cm network —
 *  flood-filling at 150 instead would fail every room whose doorway is narrower than 1.5m. */
export function turningCircles(room: Room, all: Item[]): Turn[] {
  const items = onTheFloor(all)
  const dests = items.filter(i => isDestination(i.type))
  if (!dests.length || !room.doors.length) return []
  const mw = minWalk('accessibility')
  const nav = walkGrid(room, items, mw), kn = Math.max(1, Math.round(mw / G))
  const turn = walkGrid(room, items, TURN), kt = Math.max(1, Math.round(TURN / G))
  const slack = Math.max(0, kt - kn)
  const connected = (x: number, y: number) => {
    for (let dy = 0; dy <= slack; dy++) for (let dx = 0; dx <= slack; dx++)
      if (nav.reach[(y + dy) * nav.cols + x + dx]) return true
    return false
  }
  return dests.map(i => {
    const f = footprint(i), c = center(f)
    const x0 = Math.floor(f.x / G) - kt, x1 = Math.ceil((f.x + f.w) / G), y0 = Math.floor(f.y / G) - kt, y1 = Math.ceil((f.y + f.h) / G)
    let best: Pt | null = null, bd = Infinity
    for (let y = Math.max(0, y0); y <= Math.min(turn.rows - kt, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(turn.cols - kt, x1); x++) {
      if (!turn.free[y * turn.cols + x] || !connected(x, y)) continue
      const p = { x: x * G + (kt * G) / 2, y: y * G + (kt * G) / 2 }, d = dist(p, c)
      if (d < bd) { bd = d; best = p }
    }
    return { item: i.id, label: spec(i.type).label, x: best?.x ?? c.x, y: best?.y ?? c.y, r: TURN / 2, ok: !!best }
  })
}

// ---- rules -------------------------------------------------------------
/** what a person needs in order to be able to do the thing, per activity */
const ACT = {
  study: { verb: 'study', items: ['desk', 'dining_table'] as ItemType[], own: 'desk', need: 'a desk' },
  work:  { verb: 'work',  items: ['desk', 'dining_table'] as ItemType[], own: 'desk', need: 'a desk' },
  dine:  { verb: 'eat',   items: ['dining_table'] as ItemType[], own: '', need: 'a dining table' },
  watch: { verb: 'sit',   items: ['sofa', 'armchair'] as ItemType[], own: '', need: 'seating' },
  talk:  { verb: 'sit',   items: ['sofa', 'armchair'] as ItemType[], own: '', need: 'seating' },
  sleep: { verb: 'sleep', items: ['bed_double', 'bed_single'] as ItemType[], own: 'bed', need: 'a bed' },
} satisfies Record<Activity, { verb: string; items: ItemType[]; own: string; need: string }>

/** Things that touch read as ONE object, whatever the item list says. Three desks shoved together
 *  are a conference table, not three places to work — this is what finds them. */
/** A coffee table against its sofa. `aim` is the half-to-two-thirds designers work to; `allow` is
 *  where it stops being worth mentioning — nobody needs telling they are two percent out. */
export const TABLE = { aim: [0.5, 0.66], allow: [0.45, 0.72] } as const

/** Does this room pass? The plan turns its walls green on it and the banner says it in words, from
 *  two different files — so it is one answer, not two that have to be kept in step. */
export const roomPasses = (violations: { severity?: string }[], items: { parked?: true }[]) =>
  violations.length === 0 && onTheFloor(items).length > 0

/** Closer than this and two pieces read as one object, whatever the item list says. */
/** 3.5-10ft between seats that face each other. sense_room had its own rounded copy of the far end
 *  (300), so at 302cm apart the rules said the seats were fine and sense_room said they were not a
 *  group. Same band, one number. */
export const CHAT_MAX = 305

export const TOUCHING = 15

export function clusters(items: Item[], gap = TOUCHING): Item[][] {
  const f = items.map(i => footprint(i))
  const parent = items.map((_, i) => i)
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])))
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    const A = f[a], B = f[b]
    if (A.x - gap < B.x + B.w && B.x - gap < A.x + A.w && A.y - gap < B.y + B.h && B.y - gap < A.y + A.h)
      parent[find(a)] = find(b)
  }
  const out = new Map<number, Item[]>()
  items.forEach((it, i) => { const r = find(i); out.set(r, [...(out.get(r) ?? []), it]) })
  return [...out.values()]
}

/** Is the agent's id for this piece already just its name? Then a sentence carrying both says one
 *  thing twice. Four places used to answer this question with four copies of the comparison. */
export const idIsName = (i: Item) => i.id.toLowerCase() === spec(i.type).label.toLowerCase().replace(/\s+/g, '')

/** What is actually standing on the floor. Anything set aside is in the tray, and a dozen places said
 *  so by hand. Named for the floor, not the room: store.ts has a clampInside that puts a piece back
 *  between the walls, and one name meaning two things is what this pass exists to remove. */
export const onTheFloor = <T extends { parked?: true }>(items: T[]) => items.filter(i => !i.parked)

/** Is there more than one of this kind standing in the room? Then the id is the only way to say
 *  which one you mean, and it earns its place on the label. */
export const hasTwin = (items: Item[], it: Item) =>
  onTheFloor(items).filter(o => o.type === it.type).length > 1

/** What to call a piece in a message a person reads: its name, and the agent's id for it only when
 *  that id is not already the name. */
const nameOf = (i: Item) => (idIsName(i) ? spec(i.type).label : `${spec(i.type).label} (${i.id})`)

export function check(room: Room, all: Item[], profile: Profile, only?: Rule[], hour = 9, brief?: Brief | null): Violation[] {
  const rules = only ?? PROFILE_RULES[profile]
  const V: Violation[] = []
  // parked items are set aside, not in the room — they break no geometry rule
  const parked = all.filter(i => i.parked)
  const items = onTheFloor(all)
  // Setting a piece aside used to be ONE warning however many pieces went — 5 points for emptying a
  // quarter of the room, against 11 an error for each piece that stayed and broke something. So the
  // highest-scoring layout in a tight room was always the emptiest one: dad-visits scored 41 with all
  // nine pieces in it, 75 arranged properly, and 95 with four of them thrown out. An agent optimising
  // that is not being stupid; it is doing what the number told it. A piece the human owns that ends
  // up outside the room is a failure of the layout and is now priced like one, per piece.
  if (rules.includes('doesnt_fit'))
    for (const i of parked)
      V.push({ rule: 'doesnt_fit', items: [i.id], severity: 'error',
        msg: `${nameOf(i)} is set aside, not in the room — it is the human's furniture and it has nowhere to stand`,
        fix: `move_items({id:'${i.id}', x, y}) brings it back. If it truly cannot fit, say so and what it would cost — do not just leave it out` })
  const solid = items.filter(i => !spec(i.type).passable && !spec(i.type).ceiling)
  const F = new Map(items.map(i => [i.id, footprint(i)]))
  // "Sofa (sofa) overlaps Coffee table (table)" — the id belongs in the message only when it says
  // something the name does not, which is when there are two of a kind or the agent calls it
  // something shorter.
  const name = (i: Item) => nameOf(i)

  if (rules.includes('overlap')) {
    const parent = solid.map((_, i) => i)
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])))
    let any = false
    for (let a = 0; a < solid.length; a++) for (let b = a + 1; b < solid.length; b++)
      if (hits(F.get(solid[a].id)!, F.get(solid[b].id)!)) { parent[root(a)] = root(b); any = true }
    if (any) {
      const heaps = new Map<number, Item[]>()
      for (let i = 0; i < solid.length; i++) { const r = root(i); if (parent.some((_, j) => j !== i && root(j) === r)) (heaps.get(r) ?? heaps.set(r, []).get(r)!).push(solid[i]) }
      for (const g of heaps.values()) {
        if (g.length < 2) continue
        const ids = g.map(i => i.id), last = g[g.length - 1]
        V.push({ rule: 'overlap', items: ids, severity: 'error',
          msg: g.length === 2 ? `${name(g[0])} overlaps ${name(g[1])}`
            : `${g.slice(0, -1).map(name).join(', ')} and ${name(last)} are on top of each other`,
          fix: g.length === 2
            ? `move one of them — find_space({id:'${last.id}'}) returns spots that break no rule`
            : `pull them apart one at a time — find_space for each, passing the other ${ids.length - 1} as \`ignore\`, then apply the lot with one move_items` })
      }
    }
    // solid pieces are only half of it: two pendants cannot hang from the same hole in the ceiling.
    // (Rugs are left alone on purpose — layering one over another is a real thing people do.)
    const hung = items.filter(i => spec(i.type).ceiling)
    for (let a = 0; a < hung.length; a++) for (let b = a + 1; b < hung.length; b++)
      if (hits(F.get(hung[a].id)!, F.get(hung[b].id)!))
        V.push({ rule: 'overlap', items: [hung[a].id, hung[b].id], severity: 'error', msg: `${name(hung[a])} and ${name(hung[b])} hang in the same place`, fix: 'move one, or drop it — they cannot share a ceiling point' })
  }

  if (rules.includes('out_of_bounds'))
    for (const i of items) if (!inside(F.get(i.id)!, room))
      V.push({ rule: 'out_of_bounds', items: [i.id], severity: 'error', msg: `${name(i)} is outside the room` })

  if (rules.includes('door_blocked'))
    for (const d of room.doors) { const c = doorClearance(room, d, profile)
      for (const i of solid) if (hits(F.get(i.id)!, c))
        V.push({ rule: 'door_blocked', items: [i.id], severity: 'error', ref: d.id, msg: `${name(i)} blocks the ${d.id} (needs ${c.w}×${c.h}cm clear)`, fix: 'move it out of the door swing' }) }

  if (rules.includes('walkway') && room.doors.length) {
    const mw = minWalk(profile), g = walkGrid(room, items, mw), k = Math.round(mw / G)
    const dests = items.filter(i => spec(i.type).seat || spec(i.type).bed || spec(i.type).screen || spec(i.type).tall)
    const stranded = dests.filter(i => !reachable(g, F.get(i.id)!, k))
    if (stranded.length) {
      const all = stranded.length === dests.length && dests.length > 1
      const last = stranded[stranded.length - 1]
      V.push({ rule: 'walkway', items: stranded.map(i => i.id), severity: profile === 'accessibility' ? 'error' : 'warn',
        msg: stranded.length === 1 ? `${name(stranded[0])} can't be reached with a ${mw}cm-wide path from the door`
          : all ? `nothing in this room can be reached with a ${mw}cm-wide path from the door — ${stranded.map(name).join(', ')}`
          : `${stranded.slice(0, -1).map(name).join(', ')} and ${name(last)} can't be reached with a ${mw}cm-wide path from the door`,
        fix: stranded.length === 1 ? `open a ${mw}cm corridor to it`
          : `open a ${mw}cm corridor from the door — move whatever is standing in it first` })
    }
  }

  if (rules.includes('window_blocked'))
    for (const w of room.windows) { const s = wallStrip(room, w.wall, w.pos, w.width, 40)
      for (const i of solid) if (spec(i.type).tall && hits(F.get(i.id)!, s))
        V.push({ rule: 'window_blocked', items: [i.id], severity: 'warn', ref: w.id, msg: `${name(i)} blocks the ${w.id}`, fix: 'tall furniture belongs on a solid wall' }) }

  const screens = items.filter(i => spec(i.type).screen), seats = items.filter(i => spec(i.type).seat)
  const tvs = screens.filter(i => i.type !== 'desk') // a desk is glare-sensitive but nobody watches it from a sofa
  if (rules.includes('viewing_distance'))
    for (const s of tvs) for (const c of seats) {
      const d = dist(center(F.get(s.id)!), center(F.get(c.id)!)), diag = Math.round(Math.hypot(s.w, s.w * 9 / 16)), lo = Math.round(1.5 * diag), hi = Math.round(2.5 * diag)
      if (d < lo || d > hi) V.push({ rule: 'viewing_distance', items: [c.id, s.id], severity: 'warn', msg: `${name(c)} is ${Math.round(d)}cm from ${name(s)} — ${d < lo ? 'close enough to see the pixels' : 'far enough that detail is lost'}; ${lo}–${hi}cm suits a screen that size`, fix: d < lo ? 'move the seat back' : 'bring the seat closer' })
    }

  if (rules.includes('glare')) {
    const S = sun(hour, room)
    // a window with a blind over it is a solved window — without this the rule asks for something
    // the room has no way to provide, and the agent has nowhere to go
    const covered = (w: Win) => { const strip = wallStrip(room, w.wall, w.pos, w.width, 30)
      return items.some(i => i.type === 'blind' && hits(F.get(i.id)!, strip)) }
    for (const s of screens) for (const w of room.windows) {
      if (covered(w)) continue
      const strength = windowSun(w.wall, hour, room); if (strength < 0.12) continue
      const sc = center(F.get(s.id)!), wc = wallCenter(room, w.wall, w.pos, w.width), f = front(s.rot)
      const v = { x: wc.x - sc.x, y: wc.y - sc.y }, d = Math.hypot(v.x, v.y) || 1
      const facingWindow = (v.x * f.x + v.y * f.y) / d                       // screen looks towards the window
      const beamHits = -(S.dir.x * f.x + S.dir.y * f.y)                      // sunlight travels into the screen face
      if ((facingWindow > 0.45 || beamHits > 0.55) && d < 520)
        V.push({ rule: 'glare', items: [s.id], severity: 'warn', ref: w.id,
          msg: `Sun through the ${w.id} lands on ${name(s)} at ${hour}:00 — the screen washes out in daylight`,
          fix: facingWindow > 0.45 ? `turn the screen away from that window, or add a blind over the ${w.id}` : `add a blind over the ${w.id}, or turn the screen — a low sun rakes straight across it` })
    }
  }

  // IEC 60364-7-701 draws zones around a bath or shower where a socket may not go. This is the one
  // rule in here that is not about how a room feels — it is the one that puts people in hospital.
  if (rules.includes('wet_zone') && room.outlets.length)
    for (const i of items) if (spec(i.type).wet) {
      const f = F.get(i.id)!
      const near = room.outlets.filter(o => gap(f, { x: o.x, y: o.y, w: 0, h: 0 }) < 60)
      if (near.length) V.push({ rule: 'wet_zone', items: [i.id], severity: 'error',
        msg: `a socket sits within 60cm of ${name(i)} — that is inside the wet zone`,
        fix: 'move the socket, or move the fixture: no socket belongs within 60cm of a bath, shower, basin or sink' })
    }

  if (rules.includes('outlet') && room.outlets.length)
    for (const i of items) if (spec(i.type).outlet) {
      const d = Math.min(...room.outlets.map(o => gap(F.get(i.id)!, { x: o.x, y: o.y, w: 0, h: 0 })))
      if (d > REACH) V.push({ rule: 'outlet', items: [i.id], severity: 'warn', msg: `${name(i)} is ${Math.round(d)}cm from the nearest outlet — further than the ${REACH}cm a flex reaches`, fix: `move it within ${REACH}cm of an outlet, or add one with set_room` })
    }

  if (rules.includes('bed_clearance')) {
    const c = bedSide(profile), transfer = profile === 'accessibility'
    for (const b of items) if (spec(b.type).bed) {
      const f = F.get(b.id)!, long = f.h >= f.w
      const sides: Rect[] = long ? [{ x: f.x - c, y: f.y, w: c, h: f.h }, { x: f.x + f.w, y: f.y, w: c, h: f.h }] : [{ x: f.x, y: f.y - c, w: f.w, h: c }, { x: f.x, y: f.y + f.h, w: f.w, h: c }]
      const ok = sides.some(s => inside(s, room) && !solid.some(i => i.id !== b.id && hits(F.get(i.id)!, s)))
      if (!ok) V.push({ rule: 'bed_clearance', items: [b.id], severity: transfer ? 'error' : 'warn',
        msg: transfer ? `${name(b)} has no ${c}cm transfer space — a wheelchair cannot pull alongside it` : `${name(b)} has no ${c}cm clear side to get in/out`,
        fix: `leave ${c}cm clear along one long side` })
    }
  }

  if (rules.includes('lighting')) {
    const lights = items.filter(i => isLight(i.type))
    const zones = items.filter(i => needsLight(i.type))
    if (!lights.length && zones.length) V.push({ rule: 'lighting', items: [zones[0].id], severity: 'warn', msg: 'No light source in the room — it goes dark after sunset', fix: 'add downlights or a ceiling light for the base layer' })
    else for (const z of zones) {
      const need = needsLight(z.type)!
      const inReach = lights.filter(l => dist(center(F.get(l.id)!), center(F.get(z.id)!)) <= fixture(l.type).reach)
      if (!inReach.length) { const d = Math.round(Math.min(...lights.map(l => dist(center(F.get(l.id)!), center(F.get(z.id)!)))))
        V.push({ rule: 'lighting', items: [z.id], severity: 'warn', msg: `${name(z)} is ${d}cm from the nearest light — out of its reach, that corner stays dim`, fix: 'add a fixture above it, or move a lamp closer' }) }
      else if (need === 'task' && !inReach.some(l => fixture(l.type).kind === 'task'))
        V.push({ rule: 'lighting', items: [z.id], severity: 'warn', msg: `${name(z)} only has overhead light — you would work in your own shadow`, fix: 'add a pendant above it or a floor lamp beside it' })
    }
  }

  if (rules.includes('pairing'))
    for (const it of items) { const d = DOCK[it.type]; if (!d) continue
      const hosts = items.filter(h => d.host.includes(h.type)); if (!hosts.length) continue
      // docked to ANY host of the right type counts. Judging every chair against the first desk in
      // the list made five chairs at five desks read as five chairs adrift from desk_1.
      const sibs = items.filter(i => i.type === it.type).length
      if (hosts.some(h => isDocked(it, h, sibs))) continue
      const c = center(F.get(it.id)!)
      const host = [...hosts].sort((a, b) => dist(c, center(F.get(a.id)!)) - dist(c, center(F.get(b.id)!)))[0]
      V.push({ rule: 'pairing', items: [it.id, host.id], severity: 'warn', msg: `${name(it)} is adrift from ${name(host)} — it belongs ${d.note}`, fix: `dock_item({id:'${it.id}', to:'${host.id}'}) puts it there` }) }

  // ---- accessibility: turning, transferring, reaching -----------------
  if (rules.includes('turning_circle'))
    for (const t of turningCircles(room, items)) if (!t.ok) {
      // this line built its own "label (id)" and printed "beside the sofa (sofa)" — every other
      // message goes through name(), which drops an id that only repeats the label
      const piece = items.find(i => i.id === t.item)
      V.push({ rule: 'turning_circle', items: [t.item], severity: 'error',
        msg: `no ${TURN}cm turning circle beside the ${piece ? name(piece).toLowerCase() : t.label.toLowerCase()} — a wheelchair can get there but cannot turn round`,
        fix: `clear a ${TURN / 100}m square next to it that joins up with the route from the door` }) }

  if (rules.includes('reach_range'))
    for (const o of room.outlets) {
      // a seated user reaches ~40-120cm high and needs to get the front of the chair to the wall
      const front30 = { x: o.x - 30, y: o.y - 30, w: 60, h: 60 }
      const blocker = solid.find(i => hits(F.get(i.id)!, front30))
      if (blocker) V.push({ rule: 'reach_range', items: [blocker.id], severity: 'warn',
        msg: `${name(blocker)} covers the socket at (${o.x},${o.y}) — nobody seated can reach the plug`,
        fix: 'leave 30cm clear in front of every socket' })
    }

  // ---- richer, situational rules -------------------------------------
  const seatsAll = items.filter(i => spec(i.type).seat || i.type === 'chair')

  if (rules.includes('viewing_angle'))
    for (const s of tvs) { const sf = front(s.rot), sc = center(F.get(s.id)!)
      for (const c of seats) { const cc = center(F.get(c.id)!), v = { x: cc.x - sc.x, y: cc.y - sc.y }, d = Math.hypot(v.x, v.y) || 1
        const off = Math.round(Math.acos(Math.max(-1, Math.min(1, (v.x * sf.x + v.y * sf.y) / d))) * 180 / Math.PI)
        if (off > 40) V.push({ rule: 'viewing_angle', items: [c.id, s.id], severity: 'warn', msg: `${name(c)} sits ${off}° off the centre of ${name(s)} — the picture washes out past 40°`, fix: 'swing the seat round or angle the screen towards it' }) } }

  if (rules.includes('traffic_crosses') && room.doors.length)
    for (const s of tvs) for (const c of seats) {
      const a = center(F.get(s.id)!), b = center(F.get(c.id)!)
      for (const d of room.doors) { const dp = wallCenter(room, d.wall, d.pos, d.width)
        const n = { N: { x: 0, y: 1 }, S: { x: 0, y: -1 }, W: { x: 1, y: 0 }, E: { x: -1, y: 0 } }[d.wall]
        const walkTo = { x: dp.x + n.x * 250, y: dp.y + n.y * 250 } // the first few steps into the room
        if (segmentsCross(dp, walkTo, a, b)) { V.push({ rule: 'traffic_crosses', items: [c.id, s.id], severity: 'warn', msg: `walking in from the ${d.id} cuts straight between ${name(c)} and ${name(s)} — somebody crosses the picture every time they come in`, fix: 'shift the seating group sideways so people enter behind it, not through the view' }); break } } }

  if (rules.includes('back_to_door') && room.doors.length)
    for (const c of seatsAll.concat(items.filter(i => i.type === 'desk'))) {
      const cc = center(F.get(c.id)!), f = front(c.rot)
      for (const d of room.doors) { const dp = wallCenter(room, d.wall, d.pos, d.width), v = { x: dp.x - cc.x, y: dp.y - cc.y }, len = Math.hypot(v.x, v.y) || 1
        const cos = (v.x * f.x + v.y * f.y) / len
        if (cos < -0.6 && len < 500) { V.push({ rule: 'back_to_door', items: [c.id], severity: 'warn', msg: `${name(c)} has its back to the ${d.id} — you cannot see who comes in`, fix: 'turn it so the door is in view, even at an angle' }); break } } }

  if (rules.includes('bed_under_window'))
    for (const b of items.filter(i => spec(i.type).bed)) { const bf = F.get(b.id)!
      for (const w of room.windows) { const strip = wallStrip(room, w.wall, w.pos, w.width, 60)
        if (hits(bf, strip)) { V.push({ rule: 'bed_under_window', items: [b.id], severity: 'warn', msg: `${name(b)} sits under the ${w.id} — draughty in winter, bright at dawn`, fix: 'put the headboard against a solid wall' }); break } } }

  if (rules.includes('dining_pullout')) {
    const c = pullOut(profile), why = profile === 'accessibility' ? 'a wheelchair cannot roll up to it' : 'chairs cannot pull out'
    for (const t of items.filter(i => i.type === 'dining_table' || i.type === 'desk')) { const tf = F.get(t.id)!
      const ring = { x: tf.x - c, y: tf.y - c, w: tf.w + 2 * c, h: tf.h + 2 * c }
      if (!inside(ring, room)) V.push({ rule: 'dining_pullout', items: [t.id], severity: 'warn', msg: `${name(t)} has less than ${c}cm to a wall — ${why}`, fix: `leave ${c}cm all round it` })
      else { const blocked = solid.filter(i => i.id !== t.id && i.type !== 'chair' && hits(F.get(i.id)!, ring))
        if (blocked.length) V.push({ rule: 'dining_pullout', items: [t.id, blocked[0].id], severity: 'warn', msg: `${name(blocked[0])} is inside the ${c}cm approach ring of ${name(t)}`, fix: `clear ${c}cm around it` }) } }
  }

  if (rules.includes('rug_anchor'))
    for (const r of items.filter(i => i.type === 'rug')) { const rf = F.get(r.id)!
      const touching = seats.filter(s => { const sf = F.get(s.id)!; return hits(sf, { x: rf.x - 10, y: rf.y - 10, w: rf.w + 20, h: rf.h + 20 }) })
      if (seats.length && !touching.length) V.push({ rule: 'rug_anchor', items: [r.id], severity: 'warn', msg: `${name(r)} floats on its own — a rug should sit under at least the front legs of the seating`, fix: 'slide it under the sofa or drop it' })
    }

  if (rules.includes('wall_hug') && solid.length >= 4) {
    const hugging = solid.filter(i => { const f = F.get(i.id)!; return Math.min(f.x, f.y, room.w - f.x - f.w, room.h - f.y - f.h) < 20 })
    if (hugging.length === solid.length && Math.min(room.w, room.h) > 350)
      V.push({ rule: 'wall_hug', items: [hugging[0].id], severity: 'warn', msg: 'every piece is pushed against a wall — the middle of the room is a bare hole', fix: 'float the seating group inwards, it makes a big room feel intentional' })
  }

  // Collisions and clearances do not make a room look like a room. A wardrobe has an unfinished back
  // and a bed has a headboard: in a real home they stand against a wall, and nothing said so, so an
  // agent could leave them stranded mid-floor without breaking a single rule.
  if (rules.includes('plumbing'))
    for (const i of solid) { const why = PLUMBED[i.type]; if (!why) continue
      const r = F.get(i.id)!
      const gap = Math.round(Math.min(r.x, r.y, room.w - (r.x + r.w), room.h - (r.y + r.h)))
      if (gap <= 25) continue
      V.push({ rule: 'plumbing', items: [i.id], severity: 'error',
        msg: `${name(i)} stands ${gap}cm off the nearest wall — it needs ${why}, and there is none in the middle of a floor`,
        fix: 'put it against a wall — find_space with prefer:"wall" returns those spots first' }) }

  if (rules.includes('back_to_wall'))
    for (const i of solid) { const why = BACKED[i.type]; if (!why) continue
      const r = F.get(i.id)!, f = front(i.rot)
      const gap = f.y === 1 ? r.y : f.y === -1 ? room.h - (r.y + r.h) : f.x === -1 ? room.w - (r.x + r.w) : r.x
      if (gap <= 25) continue
      // it may well be touching a wall — with its front. "430cm off the wall" for a wardrobe 12cm
      // from the south wall is true of its back and useless to the agent, so say which case it is.
      const touching = Math.min(r.x, r.y, room.w - (r.x + r.w), room.h - (r.y + r.h)) <= 25
      V.push({ rule: 'back_to_wall', items: [i.id], severity: 'warn',
        msg: touching ? `${name(i)} faces the wall and has its back to the room — it has ${why}`
          : `${name(i)} stands ${Math.round(gap)}cm clear of the wall behind it — it has ${why}`,
        fix: touching ? 'rotate it 180° so the back is to the wall and the front opens into the room'
          : 'put it against a wall — find_space with prefer:"wall" returns those spots' }) }

  // The geometry rules cannot tell a desk for one from a desk for five. Once the agent has asked WHO
  // the room is for, this is what checks the layout against the actual people who will use it.
  if (rules.includes('per_person') && brief?.people) {
    const P = brief.people, a = ACT[brief.activity], who = whoPhrase(brief)
    const relevant = items.filter(i => a.items.includes(i.type))
    const places = relevant.reduce((t, i) => t + (spec(i.type).places ?? 1), 0)
    if (places < P)
      V.push({ rule: 'per_person', items: relevant.map(i => i.id), severity: 'error',
        msg: `${who} need ${P} places to ${a.verb} — this room offers ${places}`,
        fix: `add ${P - places} ${a.own || 'place'}${P - places === 1 ? '' : 's'}${places ? ' more' : ''} — add_item({type}) lets the page choose where` })

    if (a.own) {
      const own = items.filter(i => i.type === a.own)
      if (own.length && own.length < P)
        V.push({ rule: 'per_person', items: own.map(i => i.id), severity: 'warn',
          msg: `${own.length} ${a.own}${own.length === 1 ? '' : 's'} for ${who} means sharing`,
          fix: `${who} doing their own work want an edge each — one ${a.own} per person` })
      // the failure the agent actually makes: it satisfies the count by shoving them into one slab
      for (const g of clusters(own)) if (g.length > 1) {
        const xs = g.map(i => footprint(i)), run = Math.round(Math.max(...xs.map(r => r.x + r.w)) - Math.min(...xs.map(r => r.x)))
        V.push({ rule: 'per_person', items: g.map(i => i.id), severity: 'warn',
          msg: `${g.map(i => i.id).join(', ')} are pushed together into one ${run}cm run — that reads as a single shared table, not ${g.length} places to work`,
          fix: `more than ${TOUCHING}cm between them and they stop reading as one table — leave 20 and each one is clearly somebody's own desk` })
      }
    }

    if (['study', 'work', 'dine'].includes(brief.activity)) {
      const seats = items.filter(i => i.type === 'chair' || i.type === 'armchair').length
      if (seats < P)
        V.push({ rule: 'per_person', items: items.filter(i => i.type === 'chair').map(i => i.id), severity: 'warn',
          msg: `${who} but ${seats} chair${seats === 1 ? '' : 's'}`, fix: `add ${P - seats} more chair${P - seats === 1 ? '' : 's'} and dock them` })
    }
  }

  // ---- what designers measure, and the page did not ------------------
  // 3.5-10ft between seats that face each other; 6-8ft is the comfortable band.
  if (rules.includes('conversation')) {
    const seats = items.filter(i => spec(i.type).seat)
    for (let a = 0; a < seats.length; a++) for (let b = a + 1; b < seats.length; b++) {
      const A = center(F.get(seats[a].id)!), B = center(F.get(seats[b].id)!)
      const fa = front(seats[a].rot), fb = front(seats[b].rot), d = dist(A, B)
      const toB = { x: (B.x - A.x) / d, y: (B.y - A.y) / d }
      // only judge seats that actually address each other
      if (fa.x * toB.x + fa.y * toB.y < 0.4 || fb.x * -toB.x + fb.y * -toB.y < 0.4) continue
      if (d > CHAT_MAX) V.push({ rule: 'conversation', items: [seats[a].id, seats[b].id], severity: 'warn', ref: '3.5-10ft rule',
        msg: `${name(seats[a])} and ${name(seats[b])} face each other across ${Math.round(d)}cm — too far to talk without raising your voice`,
        fix: 'bring them to 180–245cm apart, the band where conversation is comfortable' })
      else if (d < 105) V.push({ rule: 'conversation', items: [seats[a].id, seats[b].id], severity: 'warn', ref: '3.5-10ft rule',
        msg: `${name(seats[a])} and ${name(seats[b])} are ${Math.round(d)}cm apart, knee to knee`,
        fix: 'leave at least 105cm between facing seats' })
    }
  }

  // "you should not walk into a room and face the back of a piece of furniture"
  if (rules.includes('entry_view'))
    for (const d of room.doors) {
      const dc = wallCenter(room, d.wall, d.pos, d.width)
      for (const i of items.filter(x => spec(x.type).seat)) {
        const c = center(F.get(i.id)!), gap = dist(c, dc)
        if (gap > 320) continue
        const f = front(i.rot), toDoor = { x: (dc.x - c.x) / gap, y: (dc.y - c.y) / gap }
        if (f.x * toDoor.x + f.y * toDoor.y < -0.7)
          V.push({ rule: 'entry_view', items: [i.id], severity: 'warn', ref: d.id,
            msg: `you walk in through the ${d.id} and meet the back of ${name(i)}`,
            fix: 'turn it, or move it further in — the first thing you see should not be an upholstered wall' })
      }
    }

  // a coffee table should read as half to two-thirds of the sofa it serves
  if (rules.includes('proportion'))
    for (const t of items.filter(i => i.type === 'coffee_table')) {
      const sofa = items.filter(i => i.type === 'sofa').sort((p, q) => dist(center(F.get(p.id)!), center(F.get(t.id)!)) - dist(center(F.get(q.id)!), center(F.get(t.id)!)))[0]
      if (!sofa) continue
      const long = Math.max(t.w, t.h), ratio = long / Math.max(sofa.w, sofa.h)
      if (ratio < TABLE.allow[0] || ratio > TABLE.allow[1])
        V.push({ rule: 'proportion', items: [t.id, sofa.id], severity: 'warn', ref: 'half to two-thirds',
          msg: `${name(t)} is ${Math.round(ratio * 100)}% of ${name(sofa)}'s length — ${ratio < TABLE.allow[0] ? 'it reads as an afterthought' : 'it swamps the seating'}`,
          fix: `a coffee table wants to be half to two-thirds of its sofa — ${Math.round(Math.max(sofa.w, sofa.h) * TABLE.aim[0])}–${Math.round(Math.max(sofa.w, sofa.h) * TABLE.aim[1])}cm here (anything from ${Math.round(TABLE.allow[0] * 100)}% to ${Math.round(TABLE.allow[1] * 100)}% passes)` })
    }

  return V.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
}

/** shortest walk from the door to the item, as cm points (block centres) */
export function walkPath(room: Room, items: Item[], to: Item, minWidth: number): { pts: Pt[]; length: number } | null {
  const g = walkGrid(room, items, minWidth), k = Math.max(1, Math.round(minWidth / G)), f = footprint(to)
  const x0 = Math.floor(f.x / G) - k, x1 = Math.ceil((f.x + f.w) / G), y0 = Math.floor(f.y / G) - k, y1 = Math.ceil((f.y + f.h) / G)
  let best = -1, bestLen = Infinity
  for (let y = Math.max(0, y0); y <= Math.min(g.rows - k, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(g.cols - k, x1); x++) {
    const i = y * g.cols + x; if (!g.reach[i]) continue
    let n = 0; for (let j = i; j !== -1; j = g.parent[j]) n++
    if (n < bestLen) { bestLen = n; best = i }
  }
  if (best < 0) return null
  const pts: Pt[] = []
  for (let j = best; j !== -1; j = g.parent[j]) pts.push({ x: (j % g.cols) * G + (k * G) / 2, y: Math.floor(j / g.cols) * G + (k * G) / 2 })
  pts.reverse()
  let length = 0; for (let i = 1; i < pts.length; i++) length += dist(pts[i - 1], pts[i])
  return { pts: pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1), length: Math.round(length) }
}

/** score by distinct problem, not by pair: 8 overlaps among 4 items is one mess, not eight.
 *  ponytail: a pair-counted score floored at 0 for any crowded room, which told the human nothing. */
export const score = (v: Violation[]) => {
  const seen = new Set<string>()
  let penalty = 0
  for (const x of v) { const key = `${x.rule}:${x.items[0] ?? ''}`; if (seen.has(key)) continue; seen.add(key)
    penalty += x.severity === 'error' ? 11 : 5 }
  return Math.max(0, Math.round(100 - penalty))
}
