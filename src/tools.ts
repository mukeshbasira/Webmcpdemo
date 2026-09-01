import { CATALOG_TYPES, spec, type ItemType } from './catalog'
import { PRESETS, preset } from './presets'
import { CHAT_MAX, REACH, onTheFloor, TOUCHING, pullOut, bedSide, idIsName, PROFILE_RULES, RULE_LABEL, TURN, center, check, clusters, dist, footprint, front, hits, isDestination, minWalk, score, sunlit, turningCircles, walkPath, type Rule, type Violation } from './rules'
import { autoLayout, findSpace, imperial, measure, type Prefer } from './space'
import { FIXTURE, lightReport } from './light'
import { beamReach, compass, sun as solar, windowSun } from './sun'
import { DOCK, dockPosition, fits, hostFor } from './dock'
import { verify } from './verify'
import { openSheet } from './sheet'
import { KIND_NOTE, KIND_PROFILE, areaM2, buildFlat, homeFromParam, homeParam, sleepersNote, type Flat, type FlatRoom, type RoomKind } from './flat'
import { DOOR, MAX_SAVES, PROFILES, ROOM_MAX, ROOM_MIN, ROTS, SEASONS, WALL_NAME, WINDOW, addItem, addNote, clearNudge, confirm, deleteSave, drainHuman, enterRoom, feed, flash, getItem, listSaves, loadLearned, loadSave, logCall, onWall, openings, parkItem, pop, propose, push, removeItem, resizeRoom, saveRoom, set, state, stow, subscribe, uid, updateItem, whoPhrase, type Activity, type Brief, type Claim, type Item, type Profile, type Pt, type Rot, type Verdict, type Wall } from './store'


export const loadPreset = (id: string) => {
  const p = preset(id); if (!p) return false
  resetSent()
  // leaving a home for a single scene has to put the home away too, or the room switcher keeps
  // offering rooms that are no longer on screen
  set({ presetId: p.id, room: p.room, items: p.items.map(i => ({ ...i })), notes: [], feed: [], path: null, layouts: {}, spot: null, hour: 9, profile: p.profile, selected: null, humanEvents: [], history: [], calls: [], proposals: [], nudge: null, flat: null, here: null, eye: null })
  loadLearned()
  const q = new URLSearchParams(location.search); q.set('preset', p.id); history.replaceState(null, '', `?${q}`)
  return true
}
/** a whole layout in the URL hash, so a plan can be sent to someone with no account and no server */
export const encodeShare = () => { stow()   // the room on screen belongs to its home before we encode it
  return btoa(unescape(encodeURIComponent(JSON.stringify({ r: state.room, i: state.items, p: state.profile, h: state.hour,
    n: state.notes.filter(x => x.item).map(x => ({ item: x.item, text: x.text, kind: x.kind })),
    // a link to a 2BHK that arrives as one bedroom is not a link to a 2BHK
    // Only what the other end cannot work out for itself. buildFlat regenerates every room's walls,
    // doors, windows and position from the bedroom count, so encoding them was bytes down a drain —
    // and `extras` was not encoded at all, which quietly dropped a study or a balcony on arrival.
    ...(state.flat ? { f: {
      b: state.flat.bedrooms, p: state.flat.people,
      x: state.flat.rooms.filter(r => r.kind === 'study' || r.kind === 'balcony').map(r => r.kind),
      r: state.flat.rooms.filter(r => r.items.length).map(r => ({ id: r.id, i: r.items })),
    }, hr: state.here } : {}) })))) }
export const loadShare = (hash: string) => {
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(hash))))
    if (!d.r || !Array.isArray(d.i)) return false
    const n = (v: unknown, lo: number, hi: number, fb: number) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fb)
    const W = n(d.r.w, ROOM_MIN, ROOM_MAX, 500), H = n(d.r.h, ROOM_MIN, ROOM_MAX, 400)
    // Five messages read an opening's id out loud — "Sun through the north window", "you walk in
    // through the door". The presets name them that way; a shared link used to renumber them "window 1",
    // "door 1", so every one of those sentences arrived at the far end slightly broken.
    const seg = (a: unknown, kind: 'door' | 'window', width: number, min: number) => {
      const used = new Map<string, number>()
      return openings(a, W, H, width, min).map(x => {
        const base = kind === 'window' ? `${WALL_NAME[x.wall as Wall] ?? ''} window`.trim() : 'door'
        const n = (used.get(base) ?? 0) + 1; used.set(base, n)
        return { id: n > 1 ? `${base} ${n}` : base, ...x }
      })
    }
    const room = { w: W, h: H, doors: seg(d.r.doors, 'door', DOOR.wide, DOOR.min), windows: seg(d.r.windows, 'window', WINDOW.wide, WINDOW.min),
      outlets: (Array.isArray(d.r.outlets) ? d.r.outlets : []).map((o: any) => onWall(o, W, H)),
      ...(typeof d.r.north === 'number' ? { north: n(d.r.north, 0, 359, 0) } : {}), ...(SEASONS.includes(d.r.season) ? { season: d.r.season } : {}) }
    // an item that isn't in the catalog or has no finite position would crash the rules — drop it, keep the rest
    const items = d.i.filter((i: any) => i && typeof i.id === 'string' && CATALOG_TYPES.includes(i.type) && isFinite(i.x) && isFinite(i.y))
      .filter((i: any, n: number, all: any[]) => all.findIndex((j: any) => String(j.id) === String(i.id)) === n)
      .map((i: any) => ({ id: String(i.id).replace(/[^\w-]/g, '').slice(0, 24) || 'item', type: i.type as ItemType, x: Math.round(i.x), y: Math.round(i.y), rot: (((Math.round((Number(i.rot) || 0) / 90) * 90) % 360) + 360) % 360 as Rot, w: n(i.w, 20, 600, spec(i.type).w), h: n(i.h, 20, 600, spec(i.type).h), ...(i.parked ? { parked: true as const } : {}) }))
    set({ presetId: 'shared', room, items, profile: PROFILES.includes(d.p) ? d.p : 'general', hour: n(d.h, 0, 23, 9),
      notes: (Array.isArray(d.n) ? d.n : []).filter((x: any) => x && typeof x.text === 'string' && items.some((i: any) => i.id === x.item)).slice(0, 8).map((x: any) => ({ item: x.item, text: String(x.text).slice(0, 140), kind: ['say', 'ok', 'warn', 'idea'].includes(x.kind) ? x.kind : 'say', id: uid('s'), t: Date.now() })), feed: [], path: null, layouts: {}, spot: null, selected: null, humanEvents: [], history: [], calls: [], proposals: [], nudge: null })
    // a shared home arrives as a home. Rebuilt through buildFlat so a hand-edited link cannot inject a
    // room shape the rest of the page has never seen, then filled from what the link actually carried.
    if (d.f && (Array.isArray(d.f.r) || Array.isArray(d.f.rooms))) {
      const extras = (Array.isArray(d.f.x) ? d.f.x : []).filter((k: unknown) => k === 'study' || k === 'balcony')
      const shell = buildFlat(Number(d.f.b ?? d.f.bedrooms) || 1, Number(d.f.p ?? d.f.people) || 1, extras as RoomKind[])
      // older links carried whole rooms; newer ones carry only what buildFlat cannot regenerate
      const carried: { id?: unknown; i?: unknown; items?: unknown }[] = d.f.r ?? d.f.rooms ?? []
      const furniture = new Map(carried.filter(r => r && typeof r.id === 'string')
        .map(r => [r.id as string, (Array.isArray(r.i) ? r.i : Array.isArray(r.items) ? r.items : []) as any[]]))
      const rooms = shell.rooms.map(base => ({ ...base,
        items: (furniture.get(base.id) ?? []).filter((i: any) => i && CATALOG_TYPES.includes(i.type) && isFinite(i.x) && isFinite(i.y))
          .slice(0, 60).map((i: any) => ({ id: String(i.id).slice(0, 24), type: i.type as ItemType, x: Math.round(i.x), y: Math.round(i.y),
            rot: (((Math.round((Number(i.rot) || 0) / 90) * 90) % 360) + 360) % 360 as Rot,
            w: n(i.w, 20, 600, spec(i.type).w), h: n(i.h, 20, 600, spec(i.type).h) })) }))
      set({ flat: { ...shell, rooms }, here: null, presetId: 'flat' })
      if (typeof d.hr === 'string' && rooms.some(r => r.id === d.hr)) enterRoom(d.hr)
    }
    loadLearned(); return true
  } catch { return false }
}

export const violations = () => check(state.room, state.items, state.profile, undefined, state.hour, state.brief)
/** the room as a character grid, 20cm per cell. LLMs reason about a picture far better than about a
 *  list of rectangles — this is the closest thing to sight a structured tool can give. */
export function asciiMap(): { map: string; legend: Record<string, string>; cell_cm: number } {
  const C = 20, { room } = state, W = Math.ceil(room.w / C), H = Math.ceil(room.h / C)
  const g: string[][] = Array.from({ length: H }, () => Array(W).fill('·'))
  const legend: Record<string, string> = {}
  const used = new Set<string>()
  const items = state.items.filter(i => !i.parked && !spec(i.type).ceiling)
  // rugs first so furniture draws over them
  items.sort((a, b) => Number(!!spec(b.type).passable) - Number(!!spec(a.type).passable))
  for (const it of items) {
    // one unique letter per item: from its id first, then its type, then the alphabet
    const pool = `${it.id}${it.type}ABCDEFGHIJKLMNOPQRSTUVWXYZ`.toUpperCase().replace(/[^A-Z]/g, '')
    const k = [...pool].find(c => !used.has(c)) ?? '#'
    used.add(k)
    legend[spec(it.type).passable ? k.toLowerCase() : k] = `${spec(it.type).label}${idIsName(it) ? '' : ' ' + it.id} at (${it.x},${it.y}) facing ${(['S', 'W', 'N', 'E'] as const)[it.rot / 90]}`
    const f = footprint(it)
    for (let y = Math.floor(f.y / C); y < Math.min(H, Math.ceil((f.y + f.h) / C)); y++)
      for (let x = Math.floor(f.x / C); x < Math.min(W, Math.ceil((f.x + f.w) / C)); x++)
        if (y >= 0 && x >= 0) g[y][x] = spec(it.type).passable ? k.toLowerCase() : k
    // the front edge, so orientation is visible
    const fr = front(it.rot), cx = center(f)
    const ex = Math.floor((cx.x + fr.x * (f.w / 2 - 1)) / C), ey = Math.floor((cx.y + fr.y * (f.h / 2 - 1)) / C)
    if (g[ey]?.[ex] !== undefined && !spec(it.type).passable) g[ey][ex] = { 0: 'v', 90: '<', 180: '^', 270: '>' }[it.rot]!
  }
  for (const p of state.proposals) { const it = getItem(p.item); if (!it) continue
    const f = footprint({ ...it, x: p.x, y: p.y, rot: p.rot })
    for (let y = Math.floor(f.y / C); y < Math.min(H, Math.ceil((f.y + f.h) / C)); y++)
      for (let x = Math.floor(f.x / C); x < Math.min(W, Math.ceil((f.x + f.w) / C)); x++) if (g[y]?.[x] === '·') g[y][x] = '?' }
  // walls, with doors and windows cut in
  const top = Array(W).fill('─'), bot = Array(W).fill('─'), left = Array(H).fill('│'), right = Array(H).fill('│')
  const cut = (arr: string[], pos: number, width: number, ch: string) => { for (let i = Math.floor(pos / C); i < Math.min(arr.length, Math.ceil((pos + width) / C)); i++) arr[i] = ch }
  for (const d of room.doors) cut({ N: top, S: bot, W: left, E: right }[d.wall], d.pos, d.width, 'D')
  for (const w of room.windows) cut({ N: top, S: bot, W: left, E: right }[w.wall], w.pos, w.width, '=')
  for (const o of room.outlets) { const x = Math.min(W - 1, Math.floor(o.x / C)), y = Math.min(H - 1, Math.floor(o.y / C))
    if (o.y <= 0) top[x] = '⚡'; else if (o.y >= room.h) bot[x] = '⚡'; else if (o.x <= 0) left[y] = '⚡'; else if (o.x >= room.w) right[y] = '⚡' }
  const rows = [`┌${top.join('')}┐`, ...g.map((r, y) => `${left[y]}${r.join('')}${right[y]}`), `└${bot.join('')}┘`]
  legend['D'] = 'door'; legend['='] = 'window'; legend['⚡'] = 'socket'; legend['v < ^ >'] = 'front edge of an item (direction it faces)'; legend['?'] = 'proposal awaiting the human'; legend['·'] = 'floor'
  return { map: rows.join('\n'), legend, cell_cm: C }
}

/** one line the agent can read without parsing anything: where the room stands right now */
const statusLine = (v: ReturnType<typeof violations>, hc: number) => {
  const errs = v.filter(x => x.severity === 'error').length, parked = state.items.filter(i => i.parked).length
  const b = state.brief
  // The score is computed over what is IN the room and says nothing about what is not, so a bathroom
  // holding one toilet read "100/100 · all rules pass" and an agent reading that has been told it is
  // finished. rooms() already says this about an empty room; a room is owed the same sentence.
  const placed = live().length
  // not "an empty room breaks no rule" — that is what rooms() says about leaving a room out of the
  // HOME score, and printed here it sat beside "1 problem (1 must fix)" in the same sentence
  const bare = placed === 0 ? 'nothing in this room yet, so this is a score about an empty room'
    : placed < 3 && score(v) >= 90 ? `only ${placed} piece${placed === 1 ? '' : 's'} in the room, so this score is about very little`
    : ''
  return [`${score(v)}/100`,
    b ? `for ${whoPhrase(b)} to ${b.activity}` : 'nobody has said who this room is for',
    bare,
    v.length ? `${v.length} problem${v.length > 1 ? 's' : ''}${errs ? ` (${errs} must fix)` : ''}` : 'all rules pass',
    parked ? `${parked} set aside` : '',
    hc ? `${hc} human change${hc > 1 ? 's' : ''} since your last call` : ''].filter(Boolean).join(' · ')
}
/** Static reference blocks — the catalogue, the rule list, the fixture glossary — do not change
 *  between turns, but re-sending them on every call spends the agent's context on things it already
 *  knows and pushes each output past Chrome's 1.5K budget. Send each once, then a one-line pointer.
 *  Keyed, so a block that DOES change (the rules, when the goal changes) is taught again. */
const sent = new Set<string>()
export const resetSent = () => sent.clear()
const first = (key: string) => sent.has(key) ? false : (sent.add(key), true)

const base = () => { const v = violations(); const hc = drainHuman()
  return { status: statusLine(v, hc.length), score: score(v), violations: v.slice(0, 12), more_violations: Math.max(0, v.length - 12), ...(hc.length ? { humanChanges: hc } : {}) } }
const snapshot = () => ({
  preset: state.presetId, profile: state.profile, hour: state.hour,
  brief: state.brief ? { ...state.brief, requires: requires(state.brief) } : 'NOT SET — ask the human how many people use this room and what they do in it, then call brief(). Until you do, the page cannot tell a desk for one from a desk for five.', saved_layouts: Object.keys(state.layouts),
  ...(first(`rules:${state.profile}`) ? { rules: PROFILE_RULES[state.profile].map(r => RULE_LABEL[r]) } : {}),
  room: { ...state.room, units: 'cm', also_in_feet: `${imperial(state.room.w)} × ${imperial(state.room.h)}`,
    origin: 'top-left; x→east, y→south' },
  set_aside: state.items.filter(i => i.parked).map(i => ({ id: i.id, type: i.type, w: i.w, h: i.h })),
  items: live().map(i => ({ id: i.id, type: i.type, label: spec(i.type).label, x: i.x, y: i.y, rot: i.rot, w: i.w, h: i.h, footprint: i.rot % 180 ? `${i.h}×${i.w}` : `${i.w}×${i.h}`, faces: (['S', 'W', 'N', 'E'] as const)[i.rot / 90] })),
  notes: state.notes.map(n => ({ item: n.item, x: n.x, y: n.y, text: n.text })),
  ...(first('catalog') ? {
    catalog: CATALOG_TYPES.map(t => `${t} ${spec(t).w}×${spec(t).h}`),
    catalog_note: 'these are typical sizes, NOT the human\'s furniture. A plan built on approximations is how people buy a sofa that does not fit. If a piece matters, ask them to measure it and correct it with move_items({id, w, h}) — depth especially: sofa depth varies far more than width and decides whether a room works.',
  } : {}),
})

/** `when` gates a tool on the state of the room: WebMCP registers and unregisters it live, so the
 *  agent's tool list is always the tools that make sense right now. `readOnly`/`untrusted` become
 *  WebMCP annotations. */
type Tool = { name: string; title: string; description: string; inputSchema: object; readOnly?: true; untrusted?: true; destructive?: true; when?: () => boolean; run: (a: any) => unknown }
const T: Tool[] = []
type Opts = { readOnly?: true; untrusted?: true; destructive?: true; when?: () => boolean }
const tool = (name: string, title: string, description: string, properties: Record<string, unknown>, required: string[], run: (a: any) => unknown, o: Opts = {}) =>
  T.push({ name, title, description, inputSchema: { type: 'object', properties, required }, run, ...o })

const ACTS = ['study', 'work', 'dine', 'watch', 'sleep', 'talk']
/** spell the brief out as concrete requirements, so each step of the agent's plan knows what it is for */
const requires = (b: Brief) => {
  const per: Record<Activity, string[]> = {
    study: [`${b.people} desks, one each — more than ${TOUCHING}cm apart or they read as one table, not pushed into a run`, `${b.people} chairs, docked at their own desk`, 'a task light reaching every desk', `a socket within ${REACH}cm of each desk`],
    work: [`${b.people} desks, one each — more than ${TOUCHING}cm apart or they read as one table`, `${b.people} chairs, docked at their own desk`, 'a task light per desk', `a socket within ${REACH}cm of each desk`, 'nobody with their back to the door'],
    dine: [`table seating ${b.people}`, `${b.people} chairs`, `${pullOut(state.profile)}cm behind each chair to pull out`, 'a pendant centred over the table'],
    watch: [`seating for ${b.people}`, 'every seat facing the screen', 'nobody walking through the view', 'a rug under the front legs'],
    talk: [`seating for ${b.people}`, 'seats close enough to talk across', 'a focal point that is not a screen'],
    sleep: [`beds for ${b.people}`, `${bedSide(state.profile)}cm clear beside each bed`, 'bed off the window wall'],
  }
  return per[b.activity]
}

/** the cardinal rotation whose front points at `to` (rot 0 faces south) */
const faceRot = (from: Pt, to: Pt): Rot => {
  const dx = to.x - from.x, dy = to.y - from.y
  return (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 270 : 90) : (dy > 0 ? 0 : 180)) as Rot
}

const live = () => onTheFloor(state.items)
/** What to call a piece to a person: its name, plus the agent's id for it only when that id says
 *  something the name does not. */
const named = (it: Item) => {
  const name = spec(it.type).label.toLowerCase()
  return idIsName(it) ? name : `${name} (${it.id})`
}

/** Nobody answering is not the same as somebody saying no, and telling the agent it was refused makes
 *  it report a decision the human never made. Ninety seconds of silence is silence. */
const unanswered = (said: 'no' | 'no answer', refusedNote: string) =>
  said === 'no answer'
    ? { waited_for: 'the human, who did not answer in 90 seconds', note: 'nobody answered — do NOT tell them they refused. Nothing was changed; ask again when they are back.' }
    : { note: refusedNote }

const hasItems = () => live().length > 0
/** There is something worth drawing: this room, or — standing back at the whole home — any room in
 *  it. An agent that had just furnished five rooms and stepped back could not print the plan. */
/** How much work a destructive call is about to cost: what is on screen plus every room of any home
 *  behind it. It is the number quoted in the dialog, so it is asked once. */
const piecesAtStake = () =>
  live().length + (state.flat?.rooms.reduce((n, r) => n + onTheFloor(r.items).length, 0) ?? 0)

const worthDrawing = () => hasItems() || !!state.flat?.rooms.some(r => onTheFloor(r.items).length > 0)
const hasPairs = () => live().some(i => (DOCK[i.type] && hostFor(i)) || (i.type === 'blind' && state.room.windows.length))

// ---- read ---------------------------------------------------------------

tool('get_room', 'Read the room',
  "Call this first. The whole room: size, doors, windows, outlets, every item in cm (x,y = top-left of footprint, rot clockwise, rot 0 faces south), the rules in force, the violations and the score out of 100. Also humanChanges — what the human did since your last call, as events {action, item, from, to, text}. Every tool returns those, so you always see their side. Workflow: get_room → brief → sense_room → set_profile → find_space per item → move_items → say.",
  {}, [], () => {
    const { room, items, profile, hour } = state, placed = onTheFloor(items), aside = items.length - placed.length
    const S = solar(hour, room)
    const overview = `${room.w}×${room.h}cm (${Math.round(room.w * room.h / 1000) / 10}m²), ${room.doors.length} door${room.doors.length === 1 ? '' : 's'}, ${room.windows.length} window${room.windows.length === 1 ? '' : 's'}, ${room.outlets.length} socket${room.outlets.length === 1 ? '' : 's'}. `
      + `${placed.length} item${placed.length === 1 ? '' : 's'} in the room${aside ? `, ${aside} set aside` : ''}. `
      + `Goal: ${profile}. ${String(hour).padStart(2, '0')}:00, ${S.up ? S.label : 'after dark'}. `
      + `Coordinates are cm from the top-left; x runs east, y runs south; rot 0 faces south.`
    const pend = state.proposals.map(p => ({ item: p.item, x: p.x, y: p.y, rot: p.rot, why: p.why }))
    return { overview, ...asciiMap(), ...snapshot(),
      ...(state.learned.length ? { learned: state.learned.map(l => l.text), learned_note: 'what the human taught this page in earlier sessions — do not repeat a rejected move' } : {}),
      ...(pend.length ? { awaiting_human: pend, awaiting_note: 'proposals you made that the human has not accepted or rejected yet' } : {}),
      ...base() }
  }, { readOnly: true, untrusted: true })

tool('sense_room', 'How the room feels',
  'Whether this reads as a room someone lives in — the judgement collision rules cannot make. Returns a verdict and ranked composition problems (no focal point, one-sided balance, seats that form no group, dead corners, a bed or wardrobe stranded off its wall), plus how full it is, its focal point, daylight per window through the day, and each light fixture with its layer, colour temperature and reach. Read it BEFORE arranging and quote it back in say() — it makes advice sound like a person.',
  {}, [], () => {
    const { room, items, hour } = state, area = (room.w * room.h) / 10000
    const F = new Map(items.map(i => [i.id, footprint(i)]))
    // the rug, and every ceiling light, are passable: they take no floor and carry no visual weight
    const mass = items.filter(i => !spec(i.type).passable)
    const usedCm = mass.reduce((a, i) => a + F.get(i.id)!.w * F.get(i.id)!.h, 0)
    const used = usedCm / 10000
    const density = used / area
    const seats = items.filter(i => spec(i.type).seat), screens = items.filter(i => spec(i.type).screen)
    const focal = screens[0] ?? items.find(i => spec(i.type).bed) ?? items.find(i => i.type === 'dining_table')
    const corners = ([[0, 0, 'north-west'], [room.w - 100, 0, 'north-east'], [0, room.h - 100, 'south-west'], [room.w - 100, room.h - 100, 'south-east']] as const)
      .filter(([x, y]) => !items.some(i => hits(F.get(i.id)!, { x, y, w: 100, h: 100 }))).map(([, , n]) => n)
    const lightNow = room.windows.filter(w => sunlit(w.wall, hour, room)).map(w => w.id)
    const lightAll = room.windows.map(w => ({ window: w.id, sunny_hours: Array.from({ length: 24 }, (_, h) => h).filter(h => sunlit(w.wall, h, room)) }))
    const walks = seats.length && focal ? seats.map(s => ({ from: s.id, to: focal.id, cm: Math.round(dist(center(F.get(s.id)!), center(F.get(focal.id)!))) })) : []
    const conversation = seats.length > 1 ? Math.round(Math.max(...seats.flatMap((a, i) => seats.slice(i + 1).map(b => dist(center(F.get(a.id)!), center(F.get(b.id)!)))))) : 0
    const grouped = conversation > 0 && conversation <= CHAT_MAX
    // a weighted mean, so it has to divide by the weight of the SAME pieces it sums. Summing every
    // item over the area of only the solid ones is not a centroid: a 230x160 rug and a 240x240 field
    // of downlights pushed it outside the room, and the reply said 280cm off centre in a 420cm room.
    const wsum = (f: (i: Item) => number) => mass.reduce((a, i) => a + f(i) * (F.get(i.id)!.w * F.get(i.id)!.h), 0) / usedCm
    const cx = usedCm ? wsum(i => center(F.get(i.id)!).x) : room.w / 2
    const cy = usedCm ? wsum(i => center(F.get(i.id)!).y) : room.h / 2
    const offBalance = Math.round(Math.hypot(cx - room.w / 2, cy - room.h / 2))
    const heights = items.filter(i => !spec(i.type).passable && !spec(i.type).ceiling).map(i => (spec(i.type).tall ? 190 : spec(i.type).bed ? 55 : spec(i.type).screen ? 110 : 75))
    const rhythm = heights.length > 2 ? new Set(heights).size : 0
    // metrics are not a judgement: an agent handed `visual_weight_offset_cm: 140` still has to decide
    // whether that is bad. Say so out loud, in the order worth fixing.
    // What the eye actually sees is not a list of items: it is a handful of blocks. Two pieces that
    // touch read as one object, and that is the difference between five desks and one long table.
    const blocks = clusters(items.filter(i => !spec(i.type).ceiling && !spec(i.type).passable)).filter((g: Item[]) => g.length > 1)
    const groups = blocks.map(g => {
      const r = g.map(i => footprint(i))
      const gw = Math.round(Math.max(...r.map(b => b.x + b.w)) - Math.min(...r.map(b => b.x)))
      const gd = Math.round(Math.max(...r.map(b => b.y + b.h)) - Math.min(...r.map(b => b.y)))
      const kinds = [...new Set(g.map(i => i.type))]
      return { pieces: g.map(i => i.id), size_cm: `${gw}\u00d7${gd}`,
        reads_as: kinds.length === 1
          ? `one ${Math.max(gw, gd)}cm run of ${spec(kinds[0]).label.toLowerCase()} \u2014 the eye sees a single piece, not ${g.length}`
          : `one block: ${g.map(i => spec(i.type).label.toLowerCase()).join(" + ")}` }
    })
    const loners = items.filter(i => !spec(i.type).ceiling && !spec(i.type).passable && !blocks.some(g => g.includes(i)))

    const problems: string[] = []
    for (const g of groups) if (g.pieces.length > 2) problems.push(`${g.pieces.join(", ")} have merged into ${g.size_cm}cm of furniture \u2014 ${g.reads_as}`)
    if (!focal) problems.push('nothing anchors the room — there is no piece the eye lands on first')
    if (offBalance >= 140) problems.push(`everything sits on one side (${offBalance}cm off centre) — the other half reads as leftover floor`)
    if (density >= .5) problems.push('the room is crowded — something should come out')
    else if (density < .18 && items.length > 2) problems.push('the room reads unfinished — lots of bare floor between pieces')
    if (rhythm === 1 && items.length > 3) problems.push('every piece is the same height — flat and a bit institutional')
    if (seats.length > 1 && !grouped) problems.push('the seats are too far apart to talk across — they read as separate chairs, not a group')
    if (corners.length >= 2) problems.push(`${corners.length} corners are doing nothing`)
    for (const v of violations()) if (v.rule === 'back_to_wall' || v.rule === 'rug_anchor' || v.rule === 'wall_hug') problems.push(v.msg)

    return {
      groups: groups.length ? groups : 'nothing is touching \u2014 every piece reads on its own',
      standing_alone: loners.map(i => i.id),
      verdict: problems.length === 0 ? 'this reads as a room someone lives in'
        : problems.length <= 2 ? 'nearly there — a couple of things stop it reading as a finished room'
        : 'this does not read as a room yet — it reads as furniture put down in a space',
      problems: problems.length ? problems : 'none — the composition holds up',
      aesthetic: {
        balance: offBalance < 60 ? 'evenly weighted' : offBalance < 140 ? `leans ${cx > room.w / 2 ? 'east' : 'west'}${Math.abs(cy - room.h / 2) > 60 ? cy > room.h / 2 ? ' and south' : ' and north' : ''} a little` : `heavily one-sided — everything sits ${cx > room.w / 2 ? 'east' : 'west'}, the other half reads as leftover`,
        visual_weight_offset_cm: offBalance,
        height_variety: rhythm === 0 ? 'nothing to judge yet' : rhythm === 1 ? 'everything is the same height — flat and a bit institutional' : rhythm === 2 ? 'two heights; one tall piece would give the eye somewhere to rest' : 'good mix of heights, the eye moves around',
        breathing_room: density < .25 ? 'plenty — you could add a tall plant or an armchair without crowding' : density < .4 ? 'about right' : 'tight; anything more will read as clutter',
      },
      feels: density < .18 ? 'sparse — lots of bare floor, the room reads unfinished' : density < .35 ? 'comfortable — furnished but easy to move through' : density < .5 ? 'full — cosy, close to crowded' : 'crowded — hard to move, worth removing something',
      floor_used_percent: Math.round(density * 100), floor_area_m2: Math.round(area * 10) / 10,
      focal_point: focal ? `${spec(focal.type).label}${idIsName(focal) ? '' : ` (${focal.id})`}` : 'none — nothing anchors the room',
      seating: seats.length ? { count: seats.length, furthest_apart_cm: conversation, conversation_grouped: grouped, note: grouped ? 'seats are close enough to talk across' : 'seats are too far apart to feel like one group' } : 'no seating',
      distance_to_focal: walks,
      light_now: lightNow.length ? `${lightNow.join(', ')} in sun at ${hour}:00` : `no direct sun at ${hour}:00`,
      light_through_day: lightAll,
      dead_corners: corners.length ? corners : 'none — every corner is doing something',
      lighting: lightReport(state.room, state.items),
      ...(first('fixtures') ? { fixture_guide: Object.entries(FIXTURE).map(([type, f]) => ({ type, ...f })) } : {}),
    }
  }, { readOnly: true })

tool('find_space', 'Find a spot that breaks no rule',
  "Where a footprint fits: up to 5 positions {x,y,rot} that break no rule. NEVER invent coordinates — the page owns the geometry. Pass `id` to re-place something already here, `type` for something new, or raw `w`/`h`.\n\nEvery call is judged against the room AS IT IS NOW, so placing several pieces needs `ignore` (ids you will move anyway) and `plan` (spots already chosen), or they will overlap.\n\n`caveat` = the free spots cut a walkway. `least_bad` = nothing legal exists; set something aside.",
  { type: { type: 'string', enum: CATALOG_TYPES }, w: { type: 'number' }, h: { type: 'number' },
    prefer: { type: 'string', enum: ['wall', 'corner', 'center', 'near_window', 'near_outlet', 'any'] },
    near: { type: 'string', description: 'item id to stay close to' }, facing: { type: 'string', description: 'item id the front should face (e.g. sofa facing tv)' },
    id: { type: 'string', description: 'an existing item you want to RE-place — its size and type are taken from it and its current position is ignored' },
    ignore: { type: 'array', items: { type: 'string' }, description: 'item ids to treat as not in the room, because you are about to move them too' },
    plan: { type: 'array', description: 'placements you have already decided but not applied yet — pass them and the page will not hand you a spot that sits on top of one', items: { type: 'object', properties: { type: { type: 'string', enum: CATALOG_TYPES }, w: { type: 'number' }, h: { type: 'number' }, x: { type: 'number' }, y: { type: 'number' }, rot: { type: 'number', enum: ROTS } }, required: ['x', 'y'] } } }, [],
  ({ type, w, h, prefer, near, facing, plan, id, ignore }) => {
    const self = id ? getItem(id) : undefined
    if (id && !self) return { error: `unknown id ${id}` }
    const t = (type ?? self?.type) as ItemType | undefined
    // `spec` of a piece the catalogue has never heard of is undefined, and reading its width threw a
    // TypeError at the agent — from the tool it reaches for most.
    if (t !== undefined) { const unknown = noSuchPiece(t); if (unknown) return unknown }
    const W = w ?? self?.w ?? (t && spec(t).w), H = h ?? self?.h ?? (t && spec(t).h)
    if (!W || !H) return { error: 'give id, or type, or w+h' }
    const skip = [...(Array.isArray(ignore) ? ignore.filter((x: unknown) => typeof x === 'string') : []), ...(self ? [self.id] : [])]
    // a plan or ignore list longer than the room can hold is a runaway agent, not a real request:
    // 5000 pending placements used to freeze the page for 15 seconds
    // 'window' and 'door' are words the page understands; anything else has to be a real id
    const anchor = (v: unknown, key: string) =>
      typeof v === 'string' && v && !/^(window|door|outlet)$/i.test(v) && !getItem(v) ? `${key}: no item called ${v}` : null
    const lost = [anchor(near, 'near'), anchor(facing, 'facing')].filter(Boolean) as string[]
    if (lost.length) return { error: lost.join('; '), hint: 'get_room lists every id in the room', ids: live().map(i => i.id) }
    const r = findSpace(W, H, t, (prefer as Prefer) ?? 'any', near, facing, Array.isArray(plan) ? plan.slice(0, 60) : [], skip.slice(0, 60))
    // searching a crowded room one piece at a time, with no plan carried between calls, is the way
    // agents produce five spots that overlap. Say so here, once, rather than in every tool list.
    // `first` sends this once a session to save the agent's context. But when the answer is a refusal
    // the recipe IS the answer, and an agent that met the refusal on its third call had already spent
    // the one copy. Always on a refusal; once a session otherwise.
    const crowded = live().length > 3
    const refused = !r.candidates?.length
    return crowded && !Array.isArray(plan) && (refused || first('recipe'))
      ? { ...r, recipe: 'Placing several pieces? Order them biggest-anchor-first (bed, sofa, tv, desk, then the seats facing them, then small things). For each, call find_space({id, ignore: <every id still to move>, plan: <what you have chosen so far>}), push the winner onto plan, and apply the lot with one move_items at the end.' }
      : r
  }, { readOnly: true })

tool('measure', 'Measure between two items',
  'Distance in cm between two items: edge-to-edge gap and centre-to-centre. Use it before making a claim in say().',
  { a: { type: 'string' }, b: { type: 'string' } }, ['a', 'b'],
  ({ a, b }) => (a && a === b ? { error: `${a} is not two things — give two different ids` } : measure(a, b)),
  { readOnly: true, when: () => live().length >= 2 })

tool('access_check', 'Wheelchair audit',
  `A full wheelchair audit of the current layout, in real numbers: which destinations have a ${TURN}cm turning circle beside them and where that circle sits, the route width and length from the door to each one, transfer space beside the bed, approach space at tables and desks, and which sockets are unreachable from a seated position. The plan draws the circles while this profile is on. Use this instead of guessing what "accessible" means.`,
  {}, [], () => {
    const { room, items } = state, mw = minWalk('accessibility')
    const circles = turningCircles(room, items)
    const dests = items.filter(i => !i.parked && isDestination(i.type))
    const routes = dests.map(d => { const p = walkPath(room, onTheFloor(items), d, mw)
      return { to: d.id, label: spec(d.type).label, reachable: !!p, length_cm: p?.length ?? null } })
    const V = check(room, items, 'accessibility', undefined, state.hour)
    const failed = circles.filter(c => !c.ok)
    // A destination you cannot reach at all is worse than one you can reach but not turn in, and the
    // verdict tested them the other way round — so a bathroom no wheelchair can get to was reported
    // as "3 of 5 have no room to turn" and the fact never reached the one line the transcript prints.
    // The unreachable branch also named nobody, while the branch above it named every piece.
    const cannotReach = routes.filter(r => !r.reachable)
    const nameOf = (id: string, fallback: string) => { const it = getItem(id); return it ? named(it) : fallback.toLowerCase() }
    const noTurn = failed.filter(c => !cannotReach.some(r => r.to === c.item))
    return {
      standard: `${mw}cm corridors, ${TURN}cm turning circles, ${bedSide('accessibility')}cm bed transfer space, ${pullOut('accessibility')}cm approach at tables and desks, 30cm clear in front of every socket`,
      turning_circles: circles.map(c => ({ item: c.item, label: c.label, ok: c.ok, circle_centre: c.ok ? { x: c.x, y: c.y } : null })),
      routes,
      unreachable: routes.filter(r => !r.reachable).map(r => r.to),
      sockets_blocked: V.filter(v => v.rule === 'reach_range').map(v => v.msg),
      violations: V.filter(v => ['turning_circle', 'reach_range', 'walkway', 'bed_clearance', 'dining_pullout', 'door_blocked'].includes(v.rule)),
      verdict: !dests.length ? 'nothing to reach yet'
        : cannotReach.length ? `${cannotReach.length} of ${routes.length} destinations cannot be reached at all with a ${mw}cm corridor — ${cannotReach.map(r => nameOf(r.to, r.label)).join(', ')}${noTurn.length ? `; ${noTurn.length} more can be reached but not turned in — ${noTurn.map(c => nameOf(c.item, c.label)).join(', ')}` : ''}`
        : failed.length ? `${failed.length} of ${circles.length} destinations have no room to turn — ${failed.map(c => nameOf(c.item, c.label)).join(', ')}`
        : 'every destination is reachable and has room to turn',
    }
  }, { readOnly: true, when: () => state.profile === 'accessibility' })

// ---- place --------------------------------------------------------------

tool('move_items', 'Move, rotate or resize items',
  "Move, rotate and/or resize one or many items in one call — the room animates into place. Each entry is {id, x?, y?, rot?, w?, h?}: give x,y to move (cm, top-left of the footprint), rot for 0/90/180/270, w,h to correct an item's real size when the human's sofa doesn't match the catalog. Items you don't list stay put. Anything currently set aside comes back into the room. Returns the full violation report so you can correct in one more call. Get coordinates from find_space, never from guesswork.",
  { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, rot: { type: 'number', enum: ROTS }, w: { type: 'number' }, h: { type: 'number' }, why: { type: 'string', description: 'one short reason, shown to the human on the ghost' } }, required: ['id'] } },
    id: { type: 'string', description: 'shorthand for moving a single item' }, x: { type: 'number' }, y: { type: 'number' }, rot: { type: 'number', enum: ROTS }, w: { type: 'number' }, h: { type: 'number' }, why: { type: 'string' },
    propose: { type: 'boolean', description: "true = move nothing; draw ghosts for the human to accept or refuse. Propose anything they may feel strongly about. A refusal is remembered." },
    force: { type: 'boolean', description: 'do it even though it breaks a hard rule. Only after the human has said they want it anyway.' } }, [],
  (a) => {
    const list: any[] = Array.isArray(a.items) ? a.items : a.id ? [a] : []
    if (!list.length) return { error: 'give items:[{id,x,y}] or id+x+y' }
    return place(list, !!a.propose, !!a.force)
  }, { when: hasItems })

/** the one path that actually moves furniture: move_items and arrange both end here, so a composed
 *  layout is validated, clamped, ghosted and reported exactly like a hand-written one */
function place(list: any[], asProposal: boolean, force = false) {
  {
    const a = { propose: asProposal }
    if (a.propose) {
      const unknown: string[] = [], proposed: string[] = []
      for (const e of list) { const it = getItem(e.id); if (!it) { unknown.push(e.id); continue }
        propose({ item: e.id, x: Math.round(e.x ?? it.x), y: Math.round(e.y ?? it.y), rot: ((e.rot ?? it.rot) as Rot), why: e.why ? String(e.why).slice(0, 80) : undefined }); proposed.push(e.id) }
      // score the room AS IF accepted, so the agent knows what it is offering
      const ghost = state.items.map(i => { const p = state.proposals.find(q => q.item === i.id); return p ? { ...i, x: p.x, y: p.y, rot: p.rot, parked: undefined } : i })
      const v = check(state.room, ghost, state.profile, undefined, state.hour, state.brief)
      return { proposed, unknown, if_accepted: { score: score(v), violations: v.slice(0, 8) }, note: 'nothing has moved yet — tell the human to tick or cross the ghosts on the plan; their answers come back in humanChanges', ...base() }
    }
    // Every error the room ALREADY has, so the page only refuses damage this call is about to do —
    // a room that arrives broken must still be movable towards being fixed.
    const key = (v: Violation) => `${v.rule}:${v.items.join()}`
    const before = new Set(violations().filter(v => v.severity === 'error').map(key))
    // An agent that sends {id, to:{x,y}} — a very natural guess, and not this schema — used to be told
    // "moved: 1" about furniture that had not stirred. Reporting work nobody did is the one thing this
    // page is not allowed to do, so say what was expected instead.
    const KEYS = ['x', 'y', 'rot', 'w', 'h'] as const
    // "120" is a number an agent meant; it used to fall through every isFinite check and move nothing.
    // getItem forgives a capital or an article, but updateItem does not — so resolve the id to the one
    // the room actually holds, once, here. Reading the right piece and then writing to nothing reported
    // "already_there", which is a lie about furniture that never got the instruction.
    list = list.map(e => (e && typeof e === 'object'
      ? { ...e, id: getItem(e.id)?.id ?? e.id,
          ...Object.fromEntries(KEYS.filter(k => typeof e[k] === 'string' && e[k].trim() !== '' && isFinite(Number(e[k]))).map(k => [k, Number(e[k])])) }
      : e))
    // A model that has been told a room is 4.2 by 3.6 writes x:1.5. Read as centimetres that lands the
    // sofa in the corner, and the page then refuses for an OVERLAP — so the agent is told the room is
    // full when the real problem was the unit. verify() already reads a bare 2.8 as metres; this is the
    // same judgement at the other door, except that here the page says so rather than converting quietly.
    // only pieces the room actually holds: an id nobody recognises deserves "no such piece", not a
    // lecture about units for furniture that is not there
    const real = list.filter(e => getItem(e?.id))
    const pos = real.flatMap(e => (['x', 'y'] as const).map(k => e?.[k]).filter(v => typeof v === 'number' && isFinite(v))) as number[]
    const metres = pos.length > 0 && pos.every(v => v > 0 && v < 12) && Math.min(state.room.w, state.room.h) >= 100
    if (metres && !force)
      // quote the number they sent. This said "x:1.5" whatever arrived, which reads as though the page
      // misheard the value it is complaining about.
      return { error: `those look like metres — the page works in centimetres, so x:${pos[0]} puts it ${pos[0]}cm from the wall, not ${pos[0]}m`,
        did_you_mean: list.map(e => ({ id: e?.id, ...(typeof e?.x === 'number' ? { x: Math.round(e.x * 100) } : {}), ...(typeof e?.y === 'number' ? { y: Math.round(e.y * 100) } : {}) })),
        hint: `this room is ${state.room.w}×${state.room.h}cm. Pass force:true if you really did mean a spot in the top-left corner.`, ...base() }
    if (list.length && !list.some(e => KEYS.some(k => e?.[k] !== undefined)))
      return { error: 'nothing to change — give x and y in cm (top-left of the footprint), and/or rot',
        expected: '{id, x, y, rot} — or items:[{id, x, y, rot}]', got: Object.keys(list[0] ?? {}).join(', ') || 'nothing', ...base() }
    push(); const unknown: string[] = [], moved: string[] = [], stayed: string[] = []
    for (const e of list) {
      const it = getItem(e.id); if (!it) { unknown.push(e.id); continue }
      const size = (v: unknown) => (typeof v === 'number' && isFinite(v) && v >= 20 && v <= 600 ? Math.round(v) : undefined)
      const was = { x: it.x, y: it.y, rot: it.rot, w: it.w, h: it.h, parked: !!it.parked }
      updateItem(e.id, { x: e.x ?? it.x, y: e.y ?? it.y, rot: (e.rot ?? it.rot) as Rot, w: size(e.w) ?? it.w, h: size(e.h) ?? it.h, parked: undefined })
      const now = getItem(e.id)!
      // counted by what changed, not by what was asked for: the room clamps, and a clamp that lands
      // back where the piece already was is not a move
      const stir = now.x !== was.x || now.y !== was.y || now.rot !== was.rot || now.w !== was.w || now.h !== was.h || was.parked
      ;(stir ? moved : stayed).push(e.id)
    }
    // THE REFUSAL. A hard rule — a piece on top of another, or across the only door — is not a note to
    // file in the response and hope the agent reads. The page owns the room, so it declines the move,
    // puts the furniture back, says which rule and offers a spot that works. force:true overrides,
    // because the human's real room sometimes disagrees with the rules and they get the last word.
    const broke = violations().filter(v => v.severity === 'error' && !before.has(key(v)) && v.items.some(x => moved.includes(x)))
    if (broke.length && !force) {
      pop()                                   // nothing moved: the room is exactly as it was
      const first = getItem(moved[0])
      const instead = first ? findSpace(first.w, first.h, first.type, 'any', undefined, undefined, [], [first.id]) : null
      return { refused: true, moved: 0,
        because: broke.map(v => v.msg),
        fix: broke.map(v => v.fix).filter(Boolean),
        ...(instead?.candidates?.length ? { instead: instead.candidates.slice(0, 3) } : instead?.least_bad?.length ? { least_bad: instead.least_bad.slice(0, 2) } : {}),
        // The hint used to say "take one of `instead`" whatever came back — and when nothing legal
        // exists the reply carries `least_bad`, so the agent was sent to a key that was not there.
        // A pointer at a field the response does not have is worse than no pointer: it reads like the
        // page lost something.
        hint: instead?.candidates?.length
          ? 'The room is unchanged. Take one of `instead`, or pass propose:true to let the human decide, or force:true if they have told you they want it anyway.'
          : instead?.least_bad?.length
            ? 'The room is unchanged, and no legal spot for it exists — `least_bad` is the closest, and each says what it would clash with. Move what is in the way first, set something aside with remove_item({keep:true}), or pass force:true if the human has said they want it anyway.'
            : 'The room is unchanged. Move whatever is named in `because` first, or pass propose:true to let the human decide, or force:true if they have told you they want it anyway.',
        ...base() }
    }
    flash(moved)
    const b = base()
    const mine = violations().filter(v => v.items.some(x => moved.includes(x)))
    const snapped = (v: unknown) => Math.round(Number(v) / 10) * 10   // compare against the grid, not the raw number, or every snap reads as a clamp
    const clamped = list.filter(e => { const it = getItem(e.id); return it && !it.parked && ((e.x !== undefined && snapped(e.x) !== it.x) || (e.y !== undefined && snapped(e.y) !== it.y)) }).map(e => e.id)
    return { moved: moved.length, unknown, ...(stayed.length ? { already_there: stayed } : {}), items: moved.map(id => getItem(id)),
      ...(clamped.length ? { clamped, note_on_clamped: `${clamped.join(', ')} did not land where you asked — the page pulled them back inside the walls. Use find_space, or remove_item({keep:true}) if a piece genuinely does not fit.` } : {}),
      moved_ok: mine.length === 0 && unknown.length === 0,   // an id the room has never heard of is not a move that went fine
      problems_with_what_you_moved: mine.length ? mine.map(v => v.msg) : 'none',
      ...b }
  }
}

tool('dock_item', 'Snap a companion into place',
  'Snap a companion piece into its proper place next to another — or a blind onto a window (pass the window id as `to`, and it is cut to the window\'s width): a chair tucked in at the desk, chairs spaced around a dining table, the coffee table 45cm in front of the sofa, a lamp at the end of the seat, a pendant centred over the table. Use this instead of guessing coordinates for pairs — it is what makes a layout look designed rather than scattered.',
  { id: { type: 'string' }, to: { type: 'string', description: 'the host item id; omit to let the page pick the natural host' } }, ['id'],
  ({ id, to }) => { const it = getItem(id); if (!it) return { error: 'unknown id' }
    // a blind's host is a WINDOW, not a piece of furniture — the page owns where the window is
    if (it.type === 'blind') {
      const R = state.room
      const w = to ? R.windows.find(x => x.id === to) : R.windows[0]
      if (!w) return to
        ? { error: `this room has no ${String(to).slice(0, 40)}`, windows: R.windows.map(x => x.id), hint: 'omit `to` and the page will pick one' }
        : { error: 'this room has no window to cover', hint: 'set_room can add windows' }
      const along = w.wall === 'N' || w.wall === 'S'
      const rot: Rot = along ? 0 : 90
      const pos = { N: { x: w.pos, y: 0 }, S: { x: w.pos, y: R.h - 8 }, W: { x: 0, y: w.pos }, E: { x: R.w - 8, y: w.pos } }[w.wall]
      push(); updateItem(id, { ...pos, rot, w: Math.max(40, w.width), h: 8 })
      flash([id])
      return { docked_to: w.id, placement: `covering the ${w.id}, ${w.width}cm wide`, ...base() }
    }
    const host = to ? getItem(to) : hostFor(it)
    if (!host) return to
      ? { error: `no item called ${String(to).slice(0, 40)}`, ids: live().map(i => i.id), hint: 'omit `to` and the page will pick the natural host' }
      : { error: `nothing to dock ${id} to`, hint: 'add the host piece first (desk, sofa, dining table…)' }
    const sibs = state.items.filter(i => i.type === it.type).length
    for (let k = 0; k < 6; k++) { const p = dockPosition(it.type, host, it.w, it.h, k, sibs)
      if (p && fits(p, it.w, it.h, [it.id], it.type)) { push(); updateItem(id, p); flash([id]); return { docked_to: host.id, placement: DOCK[it.type]?.note, ...base() } } }
    const need = Math.round(Math.min(it.w, it.h) + (DOCK[it.type]?.gap ?? 0))
    return { error: `no room to dock ${id} to ${host.id}`,
      hint: `a ${spec(it.type).label.toLowerCase()} needs about ${need}cm clear ${DOCK[it.type]?.where === 'front' ? 'in front of' : 'beside'} ${host.id}, and something is in the way. If you laid these out with arrange, run it again with a bigger gap.` } },
  { when: hasPairs })

tool('arrange', 'Align, space and face several pieces at once',
  "Compose a SET of pieces in one call — the tool for \"line those up\". The page does the arithmetic, so you never hand-compute five coordinates or leave 20cm between two desks and 35cm between the next two. Combine `align` (a shared edge or axis), `gap` (exact cm between neighbours), `as` (lay them out afresh as a row, column or grid), `centre` ('room' or an item id) and `facing` (an item id they all turn towards). Validated like any move and slid inside the walls if it overruns.",
  { items: { type: 'array', items: { type: 'string' }, minItems: 2, description: 'the pieces to compose, 2 or more' },
    as: { type: 'string', enum: ['row', 'column', 'grid'], description: 'lay them out afresh in a line or a grid' },
    cols: { type: 'number', description: 'columns, for as:"grid" — defaults to something near square' },
    gap: { type: 'number', description: 'cm between neighbours (default 20). On its own it just re-spaces them where they stand.' },
    align: { type: 'string', enum: ['left', 'right', 'top', 'bottom', 'center_x', 'center_y'] },
    centre: { type: 'string', description: '"room", or an item id to centre the group on' },
    facing: { type: 'string', description: 'item id everything should turn to face' },
    propose: { type: 'boolean', description: 'true = draw it as ghosts and let the human decide' },
    force: { type: 'boolean', description: 'compose it even though it breaks a hard rule — only after the human has said so' } },
  ['items'],
  (a) => {
    const ids: string[] = (Array.isArray(a.items) ? a.items : []).filter((x: unknown) => typeof x === 'string')
    const its = ids.map(getItem).filter(Boolean) as Item[]
    const unknown = ids.filter(id => !getItem(id))
    if (its.length < 2) return { error: 'arrange needs at least 2 items that exist', unknown }
    if (a.as === undefined && a.align === undefined && a.gap === undefined && a.facing === undefined)
      return { error: 'say what to do: as (row/column/grid), align, gap, or facing' }

    const gap = Math.max(0, Math.min(300, Math.round(Number(a.gap ?? 20)) || 0))
    const rots = new Map(its.map(i => [i.id, i.rot]))
    const target = a.facing ? getItem(String(a.facing)) : undefined
    if (a.facing && !target) return { error: `unknown id ${a.facing} to face` }
    const size = (i: Item) => (rots.get(i.id)! % 180 ? { w: i.h, h: i.w } : { w: i.w, h: i.h })

    // where the group should sit: an explicit anchor, or exactly where it already is
    const boxes = its.map(i => footprint(i))
    const here = { x: (Math.min(...boxes.map(b => b.x)) + Math.max(...boxes.map(b => b.x + b.w))) / 2,
                   y: (Math.min(...boxes.map(b => b.y)) + Math.max(...boxes.map(b => b.y + b.h))) / 2 }
    const anchorItem = a.centre && a.centre !== 'room' ? getItem(String(a.centre)) : undefined
    if (a.centre && a.centre !== 'room' && !anchorItem) return { error: `unknown id ${a.centre} to centre on` }
    const anchor = a.centre === 'room' ? { x: state.room.w / 2, y: state.room.h / 2 }
      : anchorItem ? center(footprint(anchorItem)) : here

    // A group laid out afresh turns as ONE thing: five desks facing the board all face the same way,
    // judged from where the group will END UP, not from where each piece happens to stand right now.
    // A group that keeps its positions (align/gap alone) faces the target individually — that is what
    // puts chairs round a table.
    if (target) {
      const groupRot = faceRot(anchor, center(footprint(target)))
      for (const i of its) if (i.id !== target.id)
        rots.set(i.id, a.as ? groupRot : faceRot(center(footprint(i)), center(footprint(target))))
    }

    let out: { id: string; x: number; y: number; rot: Rot }[]

    if (a.as) {
      // keep the order the human already sees, left-to-right then top-to-bottom
      const order = [...its].sort((p, q) => (footprint(p).y - footprint(q).y) || (footprint(p).x - footprint(q).x))
      const n = order.length
      const cols = a.as === 'row' ? n : a.as === 'column' ? 1
        : Math.max(1, Math.min(n, Math.round(Number(a.cols)) || Math.ceil(Math.sqrt(n))))
      const rows = Math.ceil(n / cols)
      const colW: number[] = Array(cols).fill(0), rowH: number[] = Array(rows).fill(0)
      order.forEach((i, k) => { const s = size(i)
        colW[k % cols] = Math.max(colW[k % cols], s.w); rowH[Math.floor(k / cols)] = Math.max(rowH[Math.floor(k / cols)], s.h) })
      const totalW = colW.reduce((t, v) => t + v, 0) + gap * (cols - 1)
      const totalH = rowH.reduce((t, v) => t + v, 0) + gap * (rows - 1)
      const x0 = anchor.x - totalW / 2, y0 = anchor.y - totalH / 2
      out = order.map((i, k) => { const c = k % cols, r = Math.floor(k / cols), s = size(i)
        const cx = x0 + colW.slice(0, c).reduce((t, v) => t + v, 0) + gap * c
        const cy = y0 + rowH.slice(0, r).reduce((t, v) => t + v, 0) + gap * r
        // slots are as wide as the widest piece in the column, so a narrow one sits centred in its slot
        return { id: i.id, x: Math.round((cx + (colW[c] - s.w) / 2) / 10) * 10, y: Math.round((cy + (rowH[r] - s.h) / 2) / 10) * 10, rot: rots.get(i.id)! } })
    } else {
      out = its.map(i => ({ id: i.id, x: footprint(i).x, y: footprint(i).y, rot: rots.get(i.id)! }))
      const box = (o: typeof out[0]) => { const s = size(its.find(i => i.id === o.id)!); return { ...o, ...s } }

      if (a.gap !== undefined) {
        // re-space where they stand, along whichever axis the group is actually strung out on
        const spanX = Math.max(...boxes.map(b => b.x + b.w)) - Math.min(...boxes.map(b => b.x))
        const spanY = Math.max(...boxes.map(b => b.y + b.h)) - Math.min(...boxes.map(b => b.y))
        const axis: 'x' | 'y' = spanX >= spanY ? 'x' : 'y'
        out.sort((p, q) => p[axis] - q[axis])
        const run = out.reduce((t, o) => t + (axis === 'x' ? box(o).w : box(o).h), 0) + gap * (out.length - 1)
        let cur = (axis === 'x' ? anchor.x : anchor.y) - run / 2
        for (const o of out) { const b = box(o); o[axis] = Math.round(cur / 10) * 10; cur += (axis === 'x' ? b.w : b.h) + gap }
      }

      if (a.align) {
        const bs = out.map(box)
        const L = Math.min(...bs.map(b => b.x)), R = Math.max(...bs.map(b => b.x + b.w))
        const T = Math.min(...bs.map(b => b.y)), B = Math.max(...bs.map(b => b.y + b.h))
        const cx = bs.reduce((t, b) => t + b.x + b.w / 2, 0) / bs.length, cy = bs.reduce((t, b) => t + b.y + b.h / 2, 0) / bs.length
        for (const o of out) { const b = box(o)
          if (a.align === 'left') o.x = L
          else if (a.align === 'right') o.x = R - b.w
          else if (a.align === 'top') o.y = T
          else if (a.align === 'bottom') o.y = B - b.h
          else if (a.align === 'center_x') o.x = Math.round((cx - b.w / 2) / 10) * 10
          else if (a.align === 'center_y') o.y = Math.round((cy - b.h / 2) / 10) * 10 }
      }
    }

    // Keep the composition intact. If the group would run off a wall, slide the WHOLE group back —
    // letting each piece clamp on its own turns the even spacing you asked for into 40, 40, -30.
    const bs = out.map(o => { const s = size(its.find(i => i.id === o.id)!); return { x: o.x, y: o.y, w: s.w, h: s.h } })
    const minX = Math.min(...bs.map(b => b.x)), maxX = Math.max(...bs.map(b => b.x + b.w))
    const minY = Math.min(...bs.map(b => b.y)), maxY = Math.max(...bs.map(b => b.y + b.h))
    const wide = maxX - minX > state.room.w, tall = maxY - minY > state.room.h
    const dx = wide ? -minX : minX < 0 ? -minX : maxX > state.room.w ? state.room.w - maxX : 0
    const dy = tall ? -minY : minY < 0 ? -minY : maxY > state.room.h ? state.room.h - maxY : 0
    if (dx || dy) out = out.map(o => ({ ...o, x: Math.round((o.x + dx) / 10) * 10, y: Math.round((o.y + dy) / 10) * 10 }))

    // The composition is right; the destination may already be occupied. Composing five chairs into a
    // neat grid on top of the bed is arithmetic, not arrangement — so ask the page where a block this
    // size actually fits and move the WHOLE group there, spacing intact.
    const gw = maxX - minX, gh = maxY - minY
    const busy = state.items.filter(i => !i.parked && !ids.includes(i.id) && !spec(i.type).passable)
    const clash = busy.some(i => { const f = footprint(i)
      return bs.some(b => b.x + dx < f.x + f.w && f.x < b.x + dx + b.w && b.y + dy < f.y + f.h && f.y < b.y + dy + b.h) })
    let relocated: string | undefined
    if (clash && !wide && !tall && !a.propose) {
      const spot = findSpace(gw, gh, undefined, 'any', undefined, undefined, [], ids)
      const c = spot.candidates?.[0]          // a least-bad spot just moves the collision elsewhere
      if (c && (c.rot === 0 || c.rot === 180)) {          // a rotated slot would turn the composition sideways
        const ox = c.x - (minX + dx), oy = c.y - (minY + dy)
        out = out.map(o => ({ ...o, x: Math.round((o.x + ox) / 10) * 10, y: Math.round((o.y + oy) / 10) * 10 }))
        relocated = `the spot you asked for was occupied, so the whole group moved to ${c.x},${c.y} with its spacing intact`
      }
    }

    const r: any = place(out.map(o => ({ ...o, why: a.facing ? 'lined up, facing ' + a.facing : 'lined up' })), !!a.propose, !!a.force)
    return { arranged: out.map(o => o.id), ...(unknown.length ? { unknown } : {}),
      ...(relocated ? { relocated } : {}),
      ...(wide || tall ? { does_not_fit: `this composition is ${maxX - minX}\u00d7${maxY - minY}cm and the room is ${state.room.w}\u00d7${state.room.h}cm — it runs past the wall. Use a smaller gap, more columns, or set something aside.` } : {}),
      composed: a.as ? `${out.length} pieces as a ${a.as}${a.as === 'grid' ? '' : ''} with ${gap}cm between them` : [a.align && `aligned ${a.align}`, a.gap !== undefined && `${gap}cm apart`, a.facing && `facing ${a.facing}`].filter(Boolean).join(', '),
      ...r }
  }, { when: () => live().length >= 2 })

/** The catalogue is a fixed list and an agent will name things that are not on it. Chrome does not
 *  enforce a schema `enum`, so every tool that takes a `type` has to check for itself — and say the
 *  same thing when it fails, with the near-misses, because "no such piece" alone strands the agent. */
/** Words a model reaches for that are not the catalogue's. Suggested, never substituted: the page is
 *  about to put real furniture in someone's room, and a guess that is wrong is a piece they never asked for. */
const ALSO_CALLED: Record<string, string> = {
  couch: 'sofa', settee: 'sofa', loveseat: 'sofa', sectional: 'sofa', chaise: 'sofa',
  easy_chair: 'armchair', recliner: 'armchair', accent_chair: 'armchair',
  tv: 'tv_unit', television: 'tv_unit', tv_stand: 'tv_unit', media_unit: 'tv_unit',
  side_table: 'coffee_table', end_table: 'coffee_table', table: 'dining_table',
  closet: 'wardrobe', dresser: 'wardrobe', shelf: 'bookshelf', bookcase: 'bookshelf',
  bed: 'bed_double', king_bed: 'bed_double', queen_bed: 'bed_double', twin_bed: 'bed_single',
  cooker: 'hob', stove: 'hob', range: 'hob', washbasin: 'basin', sink_unit: 'sink',
  wc: 'toilet', loo: 'toilet', tub: 'bathtub', carpet: 'rug', worktop: 'counter',
}
const noSuchPiece = (type: unknown) => CATALOG_TYPES.includes(type as ItemType) ? null : {
  error: type === undefined ? 'which piece? `type` is a name from the catalogue' : `no such piece: ${String(JSON.stringify(type)).slice(0, 40)}`,
  hint: 'get_room lists the whole catalogue the first time you call it',
  nearest: (() => { const want = String(type ?? '').toLowerCase().trim().replace(/\s+/g, '_')
    const alias = ALSO_CALLED[want]
    return [...(alias ? [alias] : []), ...CATALOG_TYPES.filter(t => t !== alias && want.length > 2 && (t.includes(want.slice(0, 4)) || want.includes(t)))].slice(0, 4) })(),
}

tool('add_item', 'Add furniture',
  'Add a piece of furniture or a light fixture from the catalogue. Give x,y from find_space if you have somewhere in mind — or leave them out and the page picks a spot that breaks no rule, which is what you want most of the time. Returns the new item id. sense_room lists what each light fixture is for.',
  { type: { type: 'string', enum: CATALOG_TYPES }, x: { type: 'number' }, y: { type: 'number' }, rot: { type: 'number', enum: ROTS },
    prefer: { type: 'string', enum: ['wall', 'corner', 'center', 'near_window', 'near_outlet', 'any'], description: 'where it should look, when the page is choosing the spot' } }, ['type'],
  ({ type, x, y, rot, prefer }) => { const unknown = noSuchPiece(type); if (unknown) return unknown
    if (state.items.length >= 60) return { error: 'this room already holds 60 pieces — remove something before adding more', hint: 'remove_item({keep:true}) sets a piece aside without deleting it' }
    // No coordinates? The page owns the geometry, so it chooses — the same rule that stops the agent
    // guessing where to MOVE something should stop it guessing where to PUT something.
    let px = x, py = y, pr = rot, chosen: string | undefined
    if (typeof px !== 'number' || typeof py !== 'number') {
      const sp = spec(type as ItemType)
      if (sp.ceiling) {
        // A ceiling fixture hangs ABOVE the furniture, so free floor is the wrong question entirely.
        // The right one is where the room is darkest: the point furthest from the lights it already has.
        const lit = state.items.filter(i => !i.parked && spec(i.type).ceiling).map(i => center(footprint(i)))
        let best = { x: Math.round((state.room.w - sp.w) / 2 / 10) * 10, y: Math.round((state.room.h - sp.h) / 2 / 10) * 10, d: -1 }
        // ...but over something. The darkest point in the room is usually an empty corner, and nobody
        // hangs a light over an empty corner — it goes above the furniture that is standing in the dark.
        const under = state.items.filter(i => !i.parked && !spec(i.type).ceiling && !spec(i.type).passable).map(i => center(footprint(i)))
        for (let gx = 40; gx <= state.room.w - sp.w - 40; gx += 40)
          for (let gy = 40; gy <= state.room.h - sp.h - 40; gy += 40) {
            const c2 = { x: gx + sp.w / 2, y: gy + sp.h / 2 }
            if (under.length && !under.some(u => Math.hypot(u.x - c2.x, u.y - c2.y) < 180)) continue
            const d = lit.length ? Math.min(...lit.map(l => Math.hypot(l.x - c2.x, l.y - c2.y))) : 0
            if (d > best.d) best = { x: gx, y: gy, d }
          }
        px = best.x; py = best.y; pr = pr ?? 0
        chosen = lit.length ? `hung at ${px},${py} — the point furthest from the ${lit.length} light${lit.length > 1 ? 's' : ''} already up there` : `hung at ${px},${py}, the middle of the room`
      } else if (DOCK[type as ItemType] && !prefer) {
        // A lamp belongs at the end of a seat and a rug under one — the page already knows that, and
        // dropping them in the nearest free rectangle earned an instant "adrift from" complaint.
        // Adding a companion piece and then being told off for where it landed is a perverse thing
        // for a page to do to an agent that asked it to choose.
        // and of the hosts it could dock to, the one that leaves the piece able to do its job: a floor
        // lamp docked out of reach of every socket is tidy and useless
        const wants = sp.outlet && state.room.outlets.length
        const options = live().filter(i => DOCK[type as ItemType]!.host.includes(i.type))
          .map(h => ({ h, d: dockPosition(type as ItemType, h, sp.w, sp.h) }))
          .filter((o): o is { h: Item; d: NonNullable<typeof o.d> } => !!o.d)
          // The dock knows where a chair BELONGS relative to its desk. It does not know what else is
          // standing there — so a desk chair tucked under a desk beside a bed was placed inside the
          // bed, and the room came back with an overlap error the agent never made. A spot that
          // collides is not a spot; if every dock is blocked, fall through to find_space below.
          .filter(o => fits(o.d, sp.w, sp.h, [], type as ItemType))
          .map(o => ({ ...o, cost: wants ? Math.min(...state.room.outlets.map(s2 => dist(s2, { x: o.d.x + sp.w / 2, y: o.d.y + sp.h / 2 }))) : 0 }))
          .sort((m, n) => m.cost - n.cost)
        const best = options[0]
        if (best) { px = best.d.x; py = best.d.y; pr = pr ?? best.d.rot
          chosen = `docked to ${best.h.id} — ${DOCK[type as ItemType]!.note}${wants ? `, and the ${Math.round(best.cost)}cm to a socket is the shortest of the ${options.length} places it could have gone` : ''}` }
      }
      if (typeof px !== 'number' || typeof py !== 'number') {
        const r = findSpace(sp.w, sp.h, type as ItemType, (prefer as Prefer) ?? 'any', undefined, undefined, [], [])
        // a rug lies UNDER the furniture, so "nothing free" is not an answer for it either
        const c = r.candidates?.[0] ?? (sp.passable ? r.least_bad?.[0] : undefined)
        if (!c) return { error: `no spot for a ${sp.label.toLowerCase()} that breaks no rule`, hint: 'make room first, or pass x,y to put it somewhere anyway' }
        px = c.x; py = c.y; pr = pr ?? c.rot; chosen = `the page chose ${c.x},${c.y} — ${c.why}`
      }
    }
    push(); const it = addItem(type as ItemType, px, py, (pr ?? 0) as Rot); flash([it.id])
    // The room clamps whatever it is given, which is right — but an agent that asked for 99999 and got
    // 390 has to be told, or it plans its next move around a coordinate it never chose. The 10cm grid
    // is not a clamp, so compare against the grid.
    const grid = (v: number) => Math.round(v / 10) * 10
    const pulled = [typeof x === 'number' && isFinite(x) && it.x !== grid(x) ? `x ${x} → ${it.x}` : null,
      typeof y === 'number' && isFinite(y) && it.y !== grid(y) ? `y ${y} → ${it.y}` : null].filter(Boolean)
    return { item: it, ...(chosen ? { placed_for_you: chosen } : {}),
      ...(pulled.length ? { moved_to_fit: pulled.join(', '), why: 'that would have put it outside the room' } : {}), ...base() } })

tool('remove_item', 'Remove or set aside',
  "Take a piece out of the room. keep:true sets it ASIDE instead of deleting it — it leaves the floor plan, breaks no rules, and shows in the 'set aside' tray under the room, so the human can decide later. Prefer keep:true when something genuinely does not fit; it is not your furniture to throw away. move_items brings a set-aside item back.",
  { id: { type: 'string' }, keep: { type: 'boolean', description: 'true = set aside (reversible), false = delete' } }, ['id'],
  async ({ id, keep }) => { const it = getItem(id); if (!it) return { error: 'unknown id' }
    if (keep) { push(); parkItem(id); return { set_aside: id, ...base() } }
    // deleting is the one thing undo can't fully mend (bubbles and memory go with it): the call blocks on the human
    const said = await confirm(`Your agent wants to DELETE the ${named(it)}. Allow?`, it.parked ? undefined : id)
    if (said !== 'yes') return { refused: true, ...unanswered(said, `the human did not allow deleting ${id} — set it aside with keep:true instead, or ask them why`), ...base() }
    if (!getItem(id)) return { error: `${id} is gone already` }
    push(); removeItem(id); return { removed: id, allowed_by_human: true, ...base() } },
  { destructive: true, when: () => state.items.length > 0 })

tool('baseline', 'Run or restore the page\'s own arranger',
  "Run the page's own dumb greedy arranger and record its score as THE BASELINE YOU ARE MEASURED AGAINST. It knows nothing about the human, the time of day, what they told you, or why — it just packs furniture by category. Use it once at the start so the human can see the difference your judgement makes, then beat it: the panel shows 'auto NN → NN' live. Do not present its output as your work. restore:true puts the greedy version back so the human can compare it against yours side by side.",
  { restore: { type: 'boolean' } }, [],
  ({ restore }) => {
    if (restore) { const b = state.baseline; if (!b) return { error: 'no baseline yet — call baseline first' }
      push(); set({ items: b.items.map(i => ({ ...i })), path: null }); flash(b.items.map(i => i.id)); return { restored: true, baseline_score: b.score, ...base() } }
    const was = score(violations())
    const r = autoLayout(); const v = violations(); const sc = score(v)
    set({ baseline: { score: sc, profile: state.profile, items: state.items.map(i => ({ ...i })) } })
    return { ...r, baseline_score: sc, was,
      note: sc < was
        ? `baseline recorded, and it is WORSE than what was here (${was} → ${sc}) — the greedy version knows nothing about this room. Say so, undo() puts the old layout back, and beating ${was} is the real bar.`
        : 'baseline recorded — now improve on it and explain what the greedy version got wrong',
      violations: v.slice(0, 12) }
  }, { destructive: true, when: hasItems })

tool('undo', 'Undo the last change',
  'Revert the last change to the room, whether you or the human made it. Use it when a move turned out worse than what was there — after baseline, say, if the greedy version scored below the layout it replaced. Answers `undone: false` when there was nothing to undo, so it is safe to call.', {}, [],
  () => { const had = state.history.length > 0; pop()
    return { undone: had, ...(had ? {} : { note: 'there was nothing to undo — the room is as it was' }), ...base() } },
  { when: () => state.history.length > 0 })

// ---- talk on the plan ---------------------------------------------------

tool('say', 'Speak on the plan',
  "Speak to the human ON the plan: a bubble on an item, pinned at a point (`x,y`), or a banner. Use it after every change, one sentence under 90 chars. kind: say, ok, warn, idea. `options` makes it a question with up to 3 clickable answers; their choice arrives in humanChanges. If your sentence states a measurement, pass it as `claim` — the page checks it against its own geometry and either ticks it or corrects you in public. A claim you can prove beats confident prose.",
  { text: { type: 'string' }, item: { type: 'string', description: 'item id to attach the bubble to' }, x: { type: 'number' }, y: { type: 'number' },
    kind: { type: 'string', enum: ['say', 'ok', 'warn', 'idea'] },
    options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3, description: 'turns the bubble into a question with clickable answers' },
    clear: { type: 'boolean', description: 'remove all existing bubbles first' },
    claim: { type: 'object', description: 'OPTIONAL measurable claim in your sentence, which the page checks against its own geometry and marks true or corrects in front of the human',
      // "clear" was offered with no definition and reads as "clear of the thing I just mentioned". An
      // agent that wrote "moved the sofa clear of the door" got a red cross in front of the human for
      // a claim about the nearest wall, which is not what it said. The page owes it the definition.
      properties: { kind: { type: 'string', enum: ['distance', 'gap', 'angle', 'clear'],
          description: 'distance: centre to centre. gap: clear space between two pieces. clear: to the nearest WALL, not to a door. angle: how far b sits off a\'s facing.' },
        a: { type: 'string', description: 'the item the measurement is about' },
        b: { type: 'string', description: 'the second item; distance, gap and angle need one' },
        value: { type: 'number', description: 'the number you said out loud' }, unit: { type: 'string' } }, required: ['kind', 'a', 'value'] } }, ['text'],
  ({ text, item, x, y, kind, claim, options, clear }) => {
    if (typeof text !== 'string' || !text.trim()) return { error: 'say what? `text` is the sentence the human reads' }
    if (item && !getItem(item)) return { error: 'unknown item id' }
    if (clear) set({ notes: [] })
    let verdict: Verdict | undefined
    if (claim) { const v = verify(claim as Claim); if ('error' in v) return { error: v.error }; verdict = v }
    else if (item) { const c = inferClaim(String(text), item); if (c) { const v = verify(c); if (!('error' in v)) verdict = { ...v, text: `${v.text} (auto-checked)` } } }
    const opts = Array.isArray(options) && options.length >= 2 ? options.slice(0, 3).map((o: unknown) => String(o).slice(0, 24)) : undefined
    const K = ['say', 'ok', 'warn', 'idea']
    addNote({ item, x, y, text: String(text).slice(0, 140).replace(/(\S{28})(?=\S)/g, '$1 '), kind: K.includes(kind) ? kind : opts ? 'idea' : 'say', options: opts, claim, verdict })
    return { ok: true, notes: state.notes.length, ...(verdict ? { claim_checked: verdict } : {}), ...(opts ? { note: 'the answer will be in humanChanges on your next call' } : {}) }
  }, { untrusted: true })

tool('show', 'Point the human at something',
  "Direct the human's attention. `highlight`: dim all but these ids while you explain a problem. `route_to`: draw and measure the walk from the door to an item. `view`: 2D for precise work, 3D for a finished layout or the lighting after dark. `eye`: SIT THEM INSIDE THE ROOM, at that seat's eye height facing the way it faces — the argument a plan cannot make. Put them in the wheelchair by the door and let them see the sofa blocking it, then show({eye:'off'}).",
  { highlight: { type: 'array', items: { type: 'string' } }, route_to: { type: 'string' },
    panel: { type: 'string', enum: ['hide', 'show'], description: 'fold the side panel away to give the plan the whole screen, or bring it back' },
    width: { type: 'number', description: 'route corridor width in cm; defaults to the profile (60, or 90 for accessibility)' },
    view: { type: 'string', enum: ['2d', '3d'] },
    eye: { type: 'string', description: "item id to SIT INSIDE and look out from; switches to 3D on its own. 'off' stands back up." },
    eye_height: { type: 'number', description: 'cm above the floor: 120 seated in a chair, 115 in a wheelchair, 160 standing. Defaults from the piece.' } }, [],
  ({ highlight, route_to, width, view, eye, eye_height, panel }) => {
    const out: Record<string, unknown> = {}
    if (view === '2d' || view === '3d') { set({ view }); out.view = view }
    if (panel === 'hide' || panel === 'show') { set({ panelHidden: panel === 'hide' }); out.panel = panel === 'hide' ? 'folded away — the plan has the whole screen' : 'back' }
    if (eye !== undefined) {
      if (eye === 'off' || eye === null) { set({ eye: null }); out.eye = 'standing back — the plan view is back' }
      else {
        const it = getItem(String(eye))
        if (!it) out.eye = { error: 'unknown id' }
        else {
          // a plan is an argument about a room; this is the room. Only the page can show it.
          const cm = typeof eye_height === 'number' && eye_height >= 40 && eye_height <= 200 ? Math.round(eye_height)
            : spec(it.type).seat ? 120 : spec(it.type).bed ? 80 : 160
          set({ eye: { id: it.id, cm, label: spec(it.type).label }, view: '3d' })
          out.eye = { sitting_in: it.id, height_cm: cm, facing: (['south', 'west', 'north', 'east'] as const)[it.rot / 90],
            note: 'the human is now looking out from this seat in 3D — say what they should notice, then show({eye:"off"})' }
        }
      }
    }
    if (highlight !== undefined) {
      const asked = (Array.isArray(highlight) ? highlight : [highlight]).filter((i: unknown) => typeof i === 'string') as string[]
      const ok = asked.filter(i => getItem(i)), lost = asked.filter(i => !getItem(i))
      if (!ok.length) out.highlight = { error: asked.length ? `no item called ${lost.join(', ')}` : 'give one or more ids to highlight', ids: live().map(i => i.id) }
      else { set({ spot: { ids: ok, until: Date.now() + 5000 } }); setTimeout(() => set(s => (s.spot && s.spot.until <= Date.now() ? { spot: null } : {})), 5200)
        out.highlight = lost.length ? { highlighted: ok, ignored: lost, why: 'not in this room' } : ok } }
    if (route_to) { const it = getItem(route_to)
      if (!it) out.route = { error: 'unknown id' }
      else { const w = width ?? minWalk(state.profile), p = walkPath(state.room, live(), it, w)
        if (!p) { set({ path: null }); out.route = { to: route_to, reachable: false, width_cm: w, msg: `no ${w}cm-wide route from the door to ${route_to}` } }
        else { set({ path: { pts: p.pts, to: route_to, length: p.length } }); out.route = { to: route_to, reachable: true, width_cm: w, length_cm: p.length } } } }
    return Object.keys(out).length ? out : { error: 'give highlight, route_to and/or view' }
  })

// ---- scene --------------------------------------------------------------

/** `who` is a label, not a sentence — it is spliced into the line the human reads. A hard slice at 24
 *  characters put "me and my dad, who uses " into that line, dangling clause, trailing space and all.
 *  Cut at the clause first, then at a word, so what is left is something a person would have written. */
const shortName = (v: unknown) => { const s = String(v).trim().replace(/\s+/g, ' ')
  if (s.length <= 24) return s
  const head = s.slice(0, 25)
  const clause = head.search(/[,;:(]/)
  const cut = clause > 2 ? head.slice(0, clause) : head.slice(0, head.lastIndexOf(' '))
  return (cut.trim() || s.slice(0, 24)).replace(/[,;:\s]+$/, '')
}

/** The human's most consequential sentence arrives in `who`: "my dad, who uses a wheelchair" decides
 *  every clearance in the room. shortName cuts that clause off for the label, so the one word that
 *  moves corridors from 60cm to 90 and adds a 150cm turning circle was being dropped in silence —
 *  the room stayed on the general rules and scored 90 out of 100 for someone who cannot get to the sofa. */
const MOBILITY_AID = /\b(wheel ?chairs?|rollators?|walking frames?|zimmers?|mobility scooters?|crutches)\b/i

tool('brief', 'Who is this room for',
  "Record WHO uses the room and WHAT they do in it — the half of the problem geometry cannot see. A desk for one and a desk for five look identical to a collision check. Once set, the page counts places, chairs and desks against real people and catches a layout that works on paper but not in life: five desks welded into a slab is a conference table, not five places to work. ASK the human, do not assume. Call it before arranging anything. No arguments reads the current brief back.",
  { people: { type: 'number', description: 'how many people use the room at once' },
    activity: { type: 'string', enum: ['study', 'work', 'dine', 'watch', 'sleep', 'talk'] },
    who: { type: 'string', description: 'what to call them in plain words — "kids", "guests", "my dad" — used in the messages the human reads' } },
  [],
  ({ people, activity, who }) => {
    if (people === undefined && activity === undefined && who === undefined)
      return state.brief ? { brief: state.brief, requires: requires(state.brief), ...base() }
        : { brief: null, note: 'no brief yet — ask the human how many people use this room and what they do in it, then set it', ...base() }
    const corrected: string[] = []
    if (people !== undefined && (typeof people !== 'number' || !isFinite(people) || people < 1))
      corrected.push(`people: ignored ${JSON.stringify(people)} — give a number, 1 to 20`)
    // An agent asked what happens in a room writes "watching tv together", not "watch". The enum is
    // closed and the words do not overlap, so one match is not a guess — but two are, and picking
    // between them would be the page deciding what the human meant.
    const said = String(activity ?? '').toLowerCase()
    // a three letter stem, because the word an agent writes is inflected: dining is not dine, and
    // studying is not study. Two stems matching is an ambiguity, not a tie to break.
    const hits = activity !== undefined && !ACTS.includes(activity) ? ACTS.filter(a => said.includes(a.slice(0, 3))) : []
    const act = ACTS.includes(activity) ? activity : hits.length === 1 ? hits[0] : undefined
    if (act && act !== activity) corrected.push(`activity: read ${JSON.stringify(activity)} as "${act}"`)
    else if (activity !== undefined && !act)
      corrected.push(`activity: ignored ${JSON.stringify(activity)} — one of ${ACTS.join(', ')}${hits.length > 1 ? `; ${JSON.stringify(activity)} could be ${hits.join(' or ')}` : ''}`)
    // A room for one and a room for four are different rooms, and every rule about seats and places
    // counts against this number. Defaulting to 1 in silence answers the question the tool exists to
    // ask, so when nobody has said, the page says it assumed.
    const known = people !== undefined || state.brief?.people !== undefined
    if (!known) corrected.push('people: nobody has said, so the rules are counting against 1 — ask the human')
    const aid = state.profile !== 'accessibility' ? String(who ?? '').match(MOBILITY_AID)?.[0] : undefined
    const b = { people: Math.max(1, Math.min(20, Math.round(Number(people ?? state.brief?.people ?? 1)) || 1)),
      activity: (act ?? state.brief?.activity ?? 'talk') as Activity,
      // trimmed at a word, not at a character: "me and my dad, who uses " ended up in the sentence the
      // human reads, dangling clause, double space and all
      ...(who ? { who: shortName(who) } : state.brief?.who ? { who: state.brief.who } : {}) }
    set({ brief: b })
    return { brief: b, requires: requires(b), ...(corrected.length ? { corrected, note_on_corrections: 'the brief is the half of the problem geometry cannot see — call brief again with real values' } : {}),
      ...(aid ? { hint: `"${aid}" is in who, but the goal is still "${state.profile}", which allows ${minWalk(state.profile)}cm gaps and asks for no turning space at all. set_profile({profile:'accessibility'}) switches to ${minWalk('accessibility')}cm corridors and ${TURN}cm turning circles and gives you access_check. Re-read the violations after — they will not be the same room.` } : {}),
      note: 'the rules now count places, desks and chairs against these people — re-read your violations', ...base() }
  })

tool('set_profile', 'Set the design goal',
  "Set the design goal; this switches which rules apply, and the page may give you NEW TOOLS as a result — accessibility adds a wheelchair audit tool, 90cm corridors, 150cm turning circles and socket-reach checks; theater adds viewing distance, angle and glare; bedroom adds bed clearance; office adds glare and back-to-door. Returns the new rule list and violations. Re-read your tool list after calling this.",
  { profile: { type: 'string', enum: PROFILES } }, ['profile'],
  ({ profile }) => { if (!PROFILES.includes(profile)) return { error: profile === undefined ? 'which goal?' : `no such goal: ${String(JSON.stringify(profile)).slice(0, 40)}`, expected: PROFILES }; set({ profile })
    return { rules: PROFILE_RULES[profile as Profile].map(r => RULE_LABEL[r]), ...base() } })

tool('sun', 'Sun, time of day and orientation',
  'Read or set the sun. `hour` 0–23 is the time of day; `north` is the compass bearing of the wall at the top of the plan (0 = it faces north); `season` changes the sun\'s height and the day length. No arguments just reads. Always returns where the sun is now, which windows it enters and how strongly, how far the beam reaches across the floor, and for every screen the hours a window will shine on it. Ask "which way do your windows face?" rather than guessing.',
  { hour: { type: 'number', minimum: 0, maximum: 23 }, north: { type: 'number', description: '0-359; bearing of the top wall' }, season: { type: 'string', enum: SEASONS } }, [],
  ({ hour, north, season }) => {
    const r = { ...state.room }
    if (hour !== undefined) { if (typeof hour !== 'number' || !isFinite(hour) || hour < 0 || hour > 23) return { error: 'hour must be 0–23' }; set({ hour: Math.round(hour) }) }
    if (north !== undefined) { if (typeof north !== 'number' || !isFinite(north)) return { error: 'north must be 0-359' }; r.north = ((Math.round(north) % 360) + 360) % 360 }
    if (season !== undefined) { if (!SEASONS.includes(season)) return { error: `season must be ${SEASONS.slice(0, -1).join(', ')} or ${SEASONS.at(-1)}` }; r.season = season }
    if (north !== undefined || season !== undefined) set({ room: r })
    const h = state.hour, S = solar(h, state.room)
    return { hour: h, orientation_north: state.room.north ?? 0, season: state.room.season ?? 'spring', dark: h < 7 || h >= 19,
      sun: S.up ? { bearing: S.azimuth, towards: compass(S.azimuth), altitude: S.altitude, colour_kelvin: S.kelvin, beam_reach_cm: beamReach(h, state.room), label: S.label } : 'below the horizon',
      windows: state.room.windows.map(w => ({ id: w.id, wall: w.wall, direct_sun_now: Math.round(windowSun(w.wall, h, state.room) * 100) / 100, sunny_hours: Array.from({ length: 24 }, (_, x) => x).filter(x => windowSun(w.wall, x, state.room) > 0.12) })),
      glare_schedule: state.items.filter(i => spec(i.type).screen).map(i => ({ id: i.id, glare_hours: Array.from({ length: 24 }, (_, x) => x).filter(x => check(state.room, state.items, 'theater', ['glare'], x).some(v => v.items.includes(i.id))) })),
      ...base() }
  })

tool('layouts', 'Save and compare options',
  'Save the current arrangement under a short name (save), or restore one you saved earlier (load) — the room animates back into it and the human gets a button per option in the panel. With no arguments it lists what you have saved. Max 4. Use it to show option A against option B rather than describing two layouts in words.',
  { save: { type: 'string' }, load: { type: 'string' },
    action: { type: 'string', enum: ['list', 'save', 'load'], description: 'the shape `saves` uses, accepted here too' },
    name: { type: 'string', description: 'the option to save or load, when you pass `action`' } }, [],
  (a) => {
    let { save, load } = a
    if (a.action === 'save') save = a.name
    if (a.action === 'load') load = a.name
    if ((a.action === 'save' || a.action === 'load') && !a.name)
      return { error: `give a name to ${a.action}`, layouts: Object.keys(state.layouts) }
    if (save) { const n = String(save).slice(0, 12); if (!state.layouts[n] && Object.keys(state.layouts).length >= 4) return { error: 'max 4 layouts' }
      set(s => ({ layouts: { ...s.layouts, [n]: s.items.map(i => ({ ...i })) } })); return { saved: n, layouts: Object.keys(state.layouts) } }
    if (load) { const l = Object.hasOwn(state.layouts, String(load)) ? state.layouts[String(load)] : undefined
      if (!l) return { error: 'unknown layout', layouts: Object.keys(state.layouts) }
      const back = l.filter(i => !getItem(i.id)).map(i => i.id)
      push(); set({ items: l.map(i => ({ ...i })), path: null }); flash(l.map(i => i.id))
      return { loaded: load, ...(back.length ? { brought_back: back, note: `this option still contains ${back.join(', ')}, which the human removed since saving it — tell them` } : {}), ...base() } }
    return { layouts: Object.keys(state.layouts) }
  }, { destructive: true, when: hasItems })

tool('set_room', 'Define or resize the room',
  'Size in cm unless you pass `units`. w and h alone RESIZE the room, keeping doors, windows, outlets and furniture (anything the smaller room cannot hold is set aside, not deleted) — use it when the human gives you their real measurements. Add doors/windows/outlets to build a NEW EMPTY room instead. `pos` is the offset along the wall from its top/left end. Openings are ALWAYS in cm whatever `units` says, so leave them out and add them after.',
  { w: { type: 'number' }, h: { type: 'number' },
    units: { type: 'string', enum: ['cm', 'm', 'in', 'ft'], description: 'unit for w and h; default cm. If they said "12 by 14 feet" pass ft and 12/14 — never convert in your head.' },
    doors: { type: 'array', items: { type: 'object', properties: { wall: { type: 'string', enum: ['N', 'S', 'E', 'W'] }, pos: { type: 'number' }, width: { type: 'number' } }, required: ['wall', 'pos'] } },
    windows: { type: 'array', items: { type: 'object', properties: { wall: { type: 'string', enum: ['N', 'S', 'E', 'W'] }, pos: { type: 'number' }, width: { type: 'number' } }, required: ['wall', 'pos'] } },
    outlets: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] } } }, ['w', 'h'],
  async ({ w, h, doors, windows, outlets, units }) => {
    const TO_CM: Record<string, number> = { cm: 1, m: 100, in: 2.54, ft: 30.48 }
    if (units !== undefined && !(units in TO_CM)) return { error: 'units must be cm, m, in or ft' }
    const k = TO_CM[units ?? 'cm']
    if (typeof w === 'number') w = w * k
    if (typeof h === 'number') h = h * k
    if (!(typeof w === 'number' && typeof h === 'number' && w >= ROOM_MIN && w <= ROOM_MAX && h >= ROOM_MIN && h <= ROOM_MAX)) return { error: `room must be ${ROOM_MIN}–${ROOM_MAX}cm each way` }
    if (!doors && !windows && !outlets) {
      const wasAside = new Set(state.items.filter(i => i.parked).map(i => i.id))
      push(); resizeRoom(w, h)
      const nowAside = state.items.filter(i => i.parked && !wasAside.has(i.id)).map(i => i.id)
      return { resized: { w: state.room.w, h: state.room.h }, in_the_room: live().length,
        ...(nowAside.length ? { set_aside: nowAside, note: `${nowAside.join(', ')} no longer fit and ${nowAside.length === 1 ? 'is' : 'are'} set aside — nothing was deleted, and move_items brings ${nowAside.length === 1 ? 'it' : 'them'} back` } : {}),
        ...base() } }
    if (state.items.length) {
      const said = await confirm(`Your agent wants to REPLACE this room with a new empty ${w}×${h}cm one — all ${state.items.length} items go. Allow?`)
      if (said !== 'yes') return { refused: true, ...unanswered(said, 'the human kept their room — to change its size use set_room with only w and h, which keeps the furniture'), ...base() }
    }
    const W = Math.round(w / 10) * 10, H = Math.round(h / 10) * 10
    // the agent's numbers are a request, not a fact: a door cannot hang off the end of its wall, two
    // openings cannot share the same bricks, and a socket is screwed to a wall rather than the floor
    const D = openings(doors, W, H, DOOR.wide, DOOR.min), N = openings(windows, W, H, WINDOW.wide, WINDOW.min)
    const O = (Array.isArray(outlets) ? outlets : []).map((o: unknown) => onWall(o, W, H))
    const dropped = (Array.isArray(doors) ? doors.length : 0) - D.length + (Array.isArray(windows) ? windows.length : 0) - N.length
    const moved = O.filter((o, i) => { const r: any = (outlets as any[])[i]; return Math.round(r?.x) !== o.x || Math.round(r?.y) !== o.y }).length
    set({ presetId: 'custom', items: [], notes: [], history: [], humanEvents: [], layouts: {}, baseline: null, path: null,
      room: { w: W, h: H,
        doors: D.map((d, i) => ({ id: D.length > 1 ? `door ${i + 1}` : 'door', ...d })),
        windows: N.map((d, i) => ({ id: `${WALL_NAME[d.wall as Wall]} window${N.filter(x => x.wall === d.wall).length > 1 ? ` ${i + 1}` : ''}`, ...d })),
        outlets: O } })
    const q = new URLSearchParams(location.search); q.set('preset', 'custom'); history.replaceState(null, '', `?${q}`)
    return { ...snapshot(),
      ...(dropped ? { dropped_openings: `${dropped} door/window did not fit its wall, or overlapped one already there` } : {}),
      ...(moved ? { outlets_snapped: `${moved} socket${moved === 1 ? ' was' : 's were'} pulled onto the nearest wall — sockets are not free-standing` } : {}),
      ...base() }
  }, { destructive: true, untrusted: true })

tool('share', 'Make a link to this plan',
  'Returns a URL that contains the whole plan — room, furniture, goal and your bubbles — so the human can send it to someone (their dad, a partner, a landlord) with no account and no server. Nothing is uploaded; the layout lives in the link itself.',
  {}, [], () => { const url = `${location.origin}${location.pathname}#l=${encodeShare()}`
    return { url, length: url.length,
      note: state.flat ? 'the whole home is encoded in the link; anyone opening it sees every room of it'
        : 'the plan is encoded in the link; anyone opening it sees exactly this room',
      // it never reaches a server — it is a fragment — but the things people paste links INTO are not
      // all so generous, and a link that arrives truncated fails silently
      ...(url.length > 2000 ? { long: `${url.length} characters. Fine in a browser, but chat apps, QR codes and some mail clients cut links shorter than this. Tell the human to paste it somewhere that will not truncate it.` } : {}) } },
  { readOnly: true, when: hasItems })

// the human can save, reopen and delete named rooms in this browser; the agent could not, which made
// "save that as option A" the one thing on screen it was unable to do
// Two tools that exist only where they mean something. This is the clearest thing WebMCP lets a page
// do: the agent's tool list tells it where it is standing, without anyone describing the room to it.

tool('bedside_check', 'Can you get out of this bed',
  'For every bed in this room: how much clear floor there is on each side and at the foot, whether the head is against a wall, and how far the nearest socket and the door are. A bed against two walls sleeps one person, whatever its size says — this is the check that catches a double bed shoved into a corner.',
  {}, [],
  () => {
    const beds = live().filter(i => spec(i.type).bed)
    if (!beds.length) return { error: 'no bed in this room' }
    const others = live().filter(i => !spec(i.type).bed && !spec(i.type).passable).map(footprint)
    const gapTo = (x: number, y: number, w: number, h: number) => {
      const strip = { x, y, w, h }
      if (x < 0 || y < 0 || x + w > state.room.w || y + h > state.room.h) return 0
      return others.some(o => hits(strip, o)) ? 0 : Math.round(Math.min(w, h))
    }
    const door = state.room.doors[0]
    const dp = (d: typeof door) => d.wall === 'N' ? { x: d.pos + d.width / 2, y: 0 } : d.wall === 'S' ? { x: d.pos + d.width / 2, y: state.room.h }
      : d.wall === 'W' ? { x: 0, y: d.pos + d.width / 2 } : { x: state.room.w, y: d.pos + d.width / 2 }
    // The rule asks for bedSide(profile) — 60, or 90 where the room is judged on accessibility. This
    // asked for a flat 75 of its own, so a bed with 70cm each side passed the rules and was called
    // "boxed in" by the tool in the same breath, and an accessible bedroom was audited against a
    // number lower than the one it is judged by. One threshold, from the same place — and that
    // includes the verdict, which kept saying "the 75cm to get out of" long after nothing asked 75.
    const need = bedSide(state.profile)
    return { beds: beds.map(b => { const f = footprint(b)
      const left = gapTo(f.x - need, f.y, need, f.h), right = gapTo(f.x + f.w, f.y, need, f.h)
      const foot = gapTo(f.x, f.y + f.h, f.w, need), head = gapTo(f.x, f.y - need, f.w, need)
      const sockets = state.room.outlets.map(o => Math.round(dist(o, center(f))))
      const sides = [left, right].filter(v => v >= need).length
      return { bed: b.id, places: spec(b.type).places ?? 1,
        clear_left_cm: left, clear_right_cm: right, clear_at_foot_cm: foot,
        head_against_a_wall: head === 0,
        sides_you_can_get_out: sides,
        verdict: sides === 0 ? `boxed in — nobody can get out of ${b.id} without climbing over the end`
          : sides < (spec(b.type).places ?? 1) ? `sleeps ${spec(b.type).places}, but only ${sides} side${sides === 1 ? '' : 's'} has the ${need}cm to get out of — one of them is climbing over the other`
          : 'you can get out of both sides',
        nearest_socket_cm: sockets.length ? Math.min(...sockets) : null,
        to_the_door_cm: door ? Math.round(dist(center(f), dp(door))) : null } }),
      rule: `${need}cm is what this room asks for beside a bed — ${bedSide('bedroom')}cm ordinarily and ${bedSide('accessibility')}cm under the accessibility goal, the same number the bed_clearance rule holds you to. A side narrower than that is not counted as a way out. A bed against two walls sleeps one person however wide it is.` }
  }, { readOnly: true, when: () => live().some(i => spec(i.type).bed) })

tool('work_triangle', 'Is this kitchen workable',
  'The oldest rule in kitchen design: sink, hob and fridge form a triangle, and its three sides should add up to between 3.6m and 6.6m. Shorter and you cannot stand at two of them; longer and you walk miles cooking one meal. Also reports whether the hob sits next to the sink or the fridge, which is the mistake that ruins otherwise good kitchens.',
  {}, [],
  () => {
    const at = (f: (s: ReturnType<typeof spec>) => unknown) => live().find(i => f(spec(i.type)))
    const sink = at(s2 => s2.wet), hob = at(s2 => s2.hot), fridge = at(s2 => s2.cold)
    const missing = [!sink && 'sink', !hob && 'hob', !fridge && 'fridge'].filter(Boolean)
    if (missing.length) return { error: `no ${missing.join(', ')} in this room yet`, hint: 'add_item({type:"sink"}) — leave x,y out and the page will place it' }
    const P = [sink!, hob!, fridge!].map(i => center(footprint(i)))
    const leg = (a: number, b: number) => Math.round(dist(P[a], P[b]))
    const legs = { sink_to_hob: leg(0, 1), hob_to_fridge: leg(1, 2), fridge_to_sink: leg(2, 0) }
    const total = legs.sink_to_hob + legs.hob_to_fridge + legs.fridge_to_sink
    const tight = Math.min(legs.sink_to_hob, legs.hob_to_fridge)
    return { legs_cm: legs, perimeter_cm: total,
      verdict: total < 360 ? `${total}cm — too tight. Two of you cannot stand at it, and there is nowhere to put down a hot pan`
        : total > 660 ? `${total}cm — too spread out. You will walk ${Math.round((total - 660) / 100)}m more than you need to for every meal`
        : `${total}cm — inside the 360–660cm band, which is a kitchen that works`,
      hob_crowded: tight < 60 ? `only ${tight}cm between the hob and its neighbour — you need somewhere to set a pan down` : undefined,
      rule: 'sink + hob + fridge, three legs, 360–660cm in total' }
  }, { readOnly: true, when: () => { const k = live().map(i => spec(i.type)); return k.some(s2 => s2.wet) || k.some(s2 => s2.hot) } })

// ---- the flat ------------------------------------------------------------
// A home is several rooms with different jobs, and the tools that make sense depend on which one you
// are standing in. WebMCP registers and unregisters live, so the agent's tool list IS its location.

const here = () => state.flat?.rooms.find(r => r.id === state.here) ?? null
const roomLine = (r: FlatRoom) => {
  const v = check(r.room, r.items, KIND_PROFILE[r.kind], undefined, state.hour, null)
  return { id: r.id, name: r.name, kind: r.kind, size_cm: `${r.room.w}×${r.room.h}`,
    m2: Math.round(r.room.w * r.room.h / 1000) / 10, sleeps: r.kind === 'bedroom' ? r.people : undefined,
    pieces: onTheFloor(r.items).length, score: score(v),
    needs_work: v.filter(x => x.severity === 'error').length || undefined }
}

tool('define_flat', 'Lay out a whole home',
  'Set up a home of several rooms — "2BHK for four of us" — instead of one room in isolation. Give the number of bedrooms and how many people live there; the page builds a hall, that many bedrooms, a kitchen and a bathroom at ordinary sizes, works out who sleeps where, and sets each room the goal it should be judged against. Rooms start empty for you to furnish. Add a study or a balcony with `extras`. Ask the human how many bedrooms and how many people before you call this.',
  { bedrooms: { type: 'number', description: '1 to 4 — the B in 2BHK' },
    people: { type: 'number', description: 'how many live here in total' },
    extras: { type: 'array', items: { type: 'string', enum: ['study', 'balcony'] } } }, ['bedrooms', 'people'],
  async ({ bedrooms, people, extras }) => {
    const losing = piecesAtStake()
    if (losing) {
      const what = state.flat ? `this home and all ${losing} pieces in it` : `this room and all ${losing} pieces in it`
      const said = await confirm(`Your agent wants to build a new ${Math.max(1, Math.min(4, Math.round(Number(bedrooms)) || 1))}BHK — ${what} go. Allow?`)
      if (said !== 'yes') return { refused: true, ...unanswered(said, 'the human kept what they had — ask what they want to do with it before building a home over the top of it'), ...base() }
    }
    const f = buildFlat(bedrooms, people, (Array.isArray(extras) ? extras : []) as RoomKind[])
    // Stand back and look at the whole home first, the same as pressing 2BHK on the landing page does.
    // Dropping the agent straight into the hall answered a question nobody had asked yet.
    showFlat(f)
    return { flat: f.name, total_m2: areaM2(f), sleeps: sleepersNote(f),
      rooms: f.rooms.map(roomLine), you_are_in: 'the whole home — enter_room to work in one',
      note: 'every room is empty. Furnish one at a time — enter_room, then brief, find_space, add_item. The tools you can see change with the room you are standing in.',
      ...snapshot(), ...base() }
  }, { destructive: true, untrusted: true })

tool('rooms', 'Every room in the home',
  'The whole home at a glance: each room with its size, who sleeps there, how many pieces are in it and what it scores. Use it to decide what to do next and to tell the human where the home stands.',
  {}, [],
  () => { const f = state.flat; if (!f) return { error: 'no flat yet', hint: 'define_flat({bedrooms, people}) builds one' }
    stow()
    const rs = state.flat!.rooms.map(roomLine)
    // An empty room breaks no rule and so scores 100. Averaging that in reports a perfect home before
    // anyone has put a bed in it — so only rooms with something in them count towards the score.
    const done = rs.filter(r => r.pieces > 0)
    const empty = rs.filter(r => !r.pieces).map(r => r.name)
    return { flat: f.name, total_m2: areaM2(f), you_are_in: here()?.name ?? null, rooms: rs,
      ...(done.length ? { score_of_the_furnished_rooms: Math.round(done.reduce((t, r) => t + r.score, 0) / done.length) } : {}),
      ...(empty.length ? { unfurnished: empty, note: `${empty.length} room${empty.length > 1 ? 's are' : ' is'} still empty and not counted in the score — an empty room breaks no rule` } : { note: 'every room has something in it' }) }
  }, { readOnly: true, when: () => !!state.flat })

tool('enter_room', 'Move to another room',
  'Stand in a different room of the home. What you did in the room you are leaving is kept. The room you enter brings its own furniture, its own goal and its own rules — and the tool list changes with it, because a kitchen and a bedroom are not judged the same way.',
  { id: { type: 'string', description: 'room id or name from rooms(), e.g. bed1, kitchen, "Bedroom 1"' } }, ['id'],
  (a: { id?: unknown; [k: string]: unknown }) => { if (!state.flat) return { error: 'no flat yet', hint: 'define_flat({bedrooms, people}) builds one' }
    const rooms = state.flat.rooms.map(r => r.id)
    // The tool is called enter_room and its own description says "stand in a different room", so an
    // agent writes enter_room({room: 'kitchen'}). The reply was "which room? give an id" printed
    // beside a list holding the very id it had just passed — a dead end that reads as the page
    // losing track of its own arguments.
    let id = a.id, wrongKey: string | undefined
    if (id === undefined || id === null || id === '') {
      wrongKey = Object.keys(a).find(k => k !== 'id' && typeof a[k] === 'string' && (a[k] as string).trim())
      if (wrongKey) id = a[wrongKey]
    }
    if (id === undefined || id === null || id === '') return { error: 'which room? pass it as `id`', rooms }
    if (!enterRoom(String(id))) return { error: `no room called ${String(id).slice(0, 40)}`, rooms }
    const r = here()!
    return { you_are_in: r.name, judged_as: KIND_PROFILE[r.kind], what_matters: KIND_NOTE[r.kind],
      ...(wrongKey ? { read: `you passed the room as \`${wrongKey}\`; this tool's parameter is \`id\`` } : {}),
      ...(r.kind === 'bedroom' ? { sleeps: r.people } : {}), ...snapshot(), ...base() }
  }, { untrusted: true, when: () => !!state.flat })

tool('plan_sheet', 'Draw a plan they can print',
  'Open a printable plan of the room in a new tab: a scaled drawing with the overall dimensions, a numbered schedule of every piece with its footprint in centimetres AND feet-and-inches, where it sits, and the problems still open. This is the artefact somebody takes to a shop or hands to a carpenter — offer it once the layout is settled. The human presses print or save-as-PDF themselves.',
  { title: { type: 'string', description: 'what to head the sheet with, e.g. "Living room — option A"' } }, [],
  ({ title }) => {
    const name = typeof title === 'string' && title.trim() ? title.trim().slice(0, 60)
      : (PRESETS.find(p => p.id === state.presetId)?.title ?? 'Room plan')
    const v = violations()
    return openSheet(name, v)
      ? { opened: name, pieces: live().length, problems_listed: v.length,
          note: 'it is open in a new tab — tell the human to press print or save it as a PDF' }
      : { error: 'the browser blocked the new tab', hint: 'ask the human to allow pop-ups for this page, then call again' }
  }, { readOnly: true, when: worthDrawing })

tool('saves', 'Save or reopen a room on this device',
  'Named rooms kept in this browser only — nothing is uploaded. No action lists them. `save` stores the room as it stands right now under `name` (up to 12; saving over a name replaces it). `load` reopens one, replacing the current room. `delete` removes one for good. Offer to save before you rearrange anything the human might want back, and tell them the name you used.',
  { action: { type: 'string', enum: ['list', 'save', 'load', 'delete'] },
    name: { type: 'string', description: 'what to call it, up to 24 characters' } }, [],
  async ({ action, name }) => {
    const all = () => listSaves().map(v => ({ name: v.name, items: v.items.length, room: `${v.room.w}×${v.room.h}cm`, saved: new Date(v.t).toISOString() }))
    if (!action || action === 'list') return { saves: all(), limit: MAX_SAVES, note: 'kept in this browser only — a different device or a cleared cache will not have them' }
    if (!['save', 'load', 'delete'].includes(action)) return { error: `unknown action ${JSON.stringify(action).slice(0, 40)}`, expected: ['list', 'save', 'load', 'delete'] }
    const n = typeof name === 'string' ? name.trim().slice(0, 24) : ''
    if (!n) return { error: `give a name to ${action}` }
    if (action === 'save') { const r = saveRoom(n)
      return r === 'ok' ? { saved: n, saves: all() }
        : r === 'full' ? { error: `could not save — there are already ${MAX_SAVES} rooms on this device. Delete one first.`, saves: all() }
        : { error: 'this browser will not let the page store anything — private mode, or storage is full', hint: 'share() puts the whole plan in a link instead, with nothing stored' } }
    if (action === 'load') {
      if (!listSaves().some(v => v.name === n)) return { error: `no save called ${n}`, saves: all() }
      const losing = piecesAtStake()
      if (losing) {
        const said = await confirm(`Your agent wants to reopen the saved “${n}” — what is on screen now (${losing} piece${losing === 1 ? '' : 's'}) goes, and cannot be undone. Allow?`)
        if (said !== 'yes') return { refused: true, ...unanswered(said, 'the human kept what was on screen — offer to save it under a new name first'), ...base() }
      }
      return loadSave(n) ? { loaded: n, ...snapshot(), ...base() } : { error: `no save called ${n}`, saves: all() }
    }
    if (!listSaves().some(v => v.name === n)) return { error: `no save called ${n}`, saves: all() }
    deleteSave(n)
    return { deleted: n, saves: all() }
  }, { destructive: true, untrusted: true })

tool('preset', 'List or load a demo scene',
  'With no id, lists the ready-made scenes (id, title, the problem each one poses) so you can offer the human a different room. With an id, loads it, replacing the current room.',
  { id: { type: 'string', enum: PRESETS.map(p => p.id) } }, [],
  async ({ id }) => {
    if (!id) return { scenes: PRESETS.map(p => ({ id: p.id, title: p.title, problem: p.tagline })) }
    if (!PRESETS.some(p => p.id === id)) return { error: `no such scene: ${String(JSON.stringify(id)).slice(0, 40)}`, scenes: PRESETS.map(p => p.id) }
    // loading a scene throws away everything in the room; set_room asks before doing that, and so must this
    if (state.items.length && state.presetId !== id) {
      const said = await confirm(`Your agent wants to load the “${id}” scene — this room and all ${state.items.length} pieces in it go. Allow?`)
      if (said !== 'yes') return { refused: true, ...unanswered(said, 'the human kept their room — do not load a scene over work they have done'), ...base() }
    }
    return loadPreset(id) ? { ...snapshot(), ...base() } : { error: 'unknown preset' }
  }, { destructive: true, untrusted: true })

/** "2.2 m from the TV" with no claim attached: find the number, the unit and the other item, and check it anyway.
 *  A lazy agent still gets fact-checked; a careful one passes `claim` and gets exactly the check it meant. */
export function inferClaim(text: string, item: string): Claim | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(cm|mm|m|metres?|meters?)\b/i); if (!m) return null
  const value = parseFloat(m[1].replace(',', '.')), unit = m[2].toLowerCase()
  const low = text.toLowerCase()
  const other = state.items.find(i => i.id !== item && !i.parked && (low.includes(i.id.toLowerCase()) || low.includes(spec(i.type).label.toLowerCase())))
  if (other) return { kind: /gap|clear|between|behind|beside|past|space/.test(low) ? 'gap' : 'distance', a: item, b: other.id, value, unit }
  if (/wall/.test(low)) return { kind: 'clear', a: item, value, unit }
  return null
}

/** accept JSON strings, objects, or a bare value for the tool's first required parameter (set_profile('theater')) */
export function coerce(t: Tool, args: unknown): any {
  if (args == null) return {}
  if (typeof args === 'object') return args
  let v: unknown = args
  if (typeof args === 'string') { try { v = JSON.parse(args) } catch { /* a bare word, not JSON */ } }
  if (v && typeof v === 'object') return v
  const req = (t.inputSchema as any).required?.[0] ?? Object.keys((t.inputSchema as any).properties ?? {})[0]
  return req ? { [req]: v } : {}
}

/** one plain-English line per tool call, for the transcript */
/** What to tell the human about a question they were asked. Saying "you refused" to somebody who was
 *  simply not there is the page inventing their decision. */
const said = (out: any) => (out?.waited_for ? 'nobody answered, so nothing changed' : 'you refused')

export function plain(name: string, a: any, out: any): string | null {
  // A transcript line is the human's record of what the agent did. A call that failed did nothing,
  // and claiming otherwise is worse than silence: "added a shower" for a shower that would not fit is
  // how somebody ends up buying a shower. One guard here covers every tool, including the next one.
  // A refusal is NOT an error — it is an outcome, and the human should see it.
  if (out && typeof out === 'object' && 'error' in out) return null
  // "the sofa (sofa)" is one fact printed twice. The id earns its place when it is not already what
  // the thing is called — which is exactly when the human needs it to follow what the agent means.
  const label = (id: string) => { const it = getItem(id); return it ? named(it) : id }
  switch (name) {
    case 'get_room': return 'looked at the room'
    case 'sense_room': return `read the feel of the room — ${String(out?.feels ?? '').split(' —')[0]}, focal point ${out?.focal_point ?? '?'}`
    case 'find_space': return `looked for a spot for ${a.id ? label(a.id) : a.type ? spec(a.type).label.toLowerCase() : `${a.w}×${a.h}`}${a.facing ? ` facing ${label(a.facing)}` : ''}${a.near ? ` near ${label(a.near)}` : ''}`
    case 'measure': return `measured ${label(a.a)} to ${label(a.b)} — ${out?.edge_to_edge}cm apart`
    case 'access_check': return `ran the wheelchair audit — ${out?.verdict ?? ''}`
    case 'move_items': return out?.error ? null : out?.refused ? `refused to move ${label(a.id ?? a.items?.[0]?.id)} — ${out.because?.[0]}` : a.propose ? `proposed ${out.proposed?.length} move${out.proposed?.length === 1 ? '' : 's'} — waiting for you (${out.if_accepted?.score}/100 if you accept)` : `moved ${out.moved} item${out.moved === 1 ? '' : 's'}${out.moved === 1 ? ` — ${label(a.id ?? a.items?.[0]?.id)}` : ''}`
    case 'share': return 'made a link to this plan'
    case 'read_message_from_human': return 'read your message'
    // arrange takes `propose` exactly as move_items does, and only move_items said so. On the beat
    // whose whole point is "it PROPOSES rather than moves — it is your bed, not its bed", the line
    // the human read was "lined up 2 pieces", while the bed had not moved an inch.
    case 'arrange': return out?.error ? null : out?.refused ? `refused to line those up — ${out.because?.[0]}`
      : a.propose ? `proposed lining up ${out.proposed?.length ?? out.arranged?.length} pieces — waiting for you (${out.if_accepted?.score}/100 if you accept)`
      : `lined up ${out.arranged?.length} pieces — ${out.composed}`
    case 'dock_item': return out?.error ? null : `docked ${label(a.id)} — ${out.placement ?? ''}`
    case 'add_item': return `added a ${CATALOG_TYPES.includes(a.type) ? spec(a.type as ItemType).label.toLowerCase() : String(a.type).replace(/_/g, ' ')}`
    // "it does not fit" is a reason the page invented: find_space's own advice is to set something
    // aside to MAKE room, which is a deliberate choice, not a failure. And this was the one line in
    // the switch using the raw id where every neighbour calls label().
    case 'remove_item': return a.keep ? `set ${label(a.id)} aside — out of the room, not deleted` : out?.refused ? `asked to delete ${label(a.id)} — ${said(out)}` : out?.error ? null : `removed ${label(a.id)} — you allowed it`
    // the tool itself already tells the agent "it is WORSE than what was here — beating 90 is the real
    // bar", and this line went on calling the lower number the target in front of the human
    case 'baseline': return a.restore ? 'put the greedy baseline back for comparison'
      : typeof out?.was === 'number' && out.baseline_score < out.was
        ? `ran the page's greedy baseline → ${out.baseline_score}/100, worse than the ${out.was} that was already here — the bar is still ${out.was}`
        : `ran the page's greedy baseline → ${out?.baseline_score}/100 (the number to beat)`
    // undo advertises itself as safe to call and answers undone:false when there was nothing to undo.
    // The transcript said "undid the last change" either way, which puts a change in the human's
    // record of the session that never happened.
    case 'undo': return out?.undone === false ? 'tried to undo — there was nothing to undo' : 'undid the last change'
    case 'say': return `${Array.isArray(a.options) ? 'asked' : 'said'}: “${a.text}”${Array.isArray(a.options) ? ` (${a.options.join(' / ')})` : ''}${out?.claim_checked ? (out.claim_checked.ok ? ' ✓ page checked it' : ' ✗ page says otherwise') : ''}`
    case 'show': return [a.view && `switched to ${String(a.view).toUpperCase()}`,
      a.eye && (a.eye === 'off' ? 'stood you back up' : `sat you in ${label(a.eye)} — this is what they see`), a.highlight && `highlighted ${[a.highlight].flat().map(label).join(', ')}`,
      a.route_to && ((out?.route as any)?.reachable ? `traced the route to ${label(a.route_to)} — ${(((out.route as any).length_cm) / 100).toFixed(1)} m` : `found no route to ${label(a.route_to)}`)].filter(Boolean).join(', ') || null
    case 'brief': return a.people === undefined && a.activity === undefined ? null
      : `noted who this room is for — ${whoPhrase(out?.brief ?? { people: Number(a.people) || 1, who: a.who })} to ${out?.brief?.activity ?? a.activity}`
    case 'set_profile': return `set the goal to ${a.profile}`
    case 'sun': return a.hour !== undefined ? `set the time to ${a.hour}:00` : a.north !== undefined || a.season !== undefined ? `set the room orientation — ${(out?.sun as any)?.label ?? ''}` : `checked where the sun is at ${state.hour}:00`
    case 'layouts': return a.save ? `saved option “${a.save}”` : a.load ? `loaded option “${a.load}”` : null
    case 'set_room': return out?.resized ? `resized the room to ${out.resized.w}×${out.resized.h}cm${out.set_aside?.length ? ` — ${out.set_aside.length} piece${out.set_aside.length === 1 ? '' : 's'} no longer fit and went to the tray` : ''}` : out?.refused ? `asked to replace the room — ${said(out)}`
      : `made a ${a.w}×${a.h}${a.units && a.units !== 'cm' ? `${a.units} room — ${out?.room?.w}×${out?.room?.h}cm` : 'cm room'}`
    case 'saves': return out?.error ? null
      : a.action === 'save' ? `saved this room on your device as “${out.saved}”`
      : a.action === 'load' ? (out?.refused ? `asked to reopen “${a.name}” — ${said(out)}` : `reopened your save “${out.loaded}”`)
      : a.action === 'delete' ? `deleted your save “${out.deleted}”`
      : `checked your saved rooms — ${out?.saves?.length ?? 0} on this device`
    case 'bedside_check': return out?.error ? null : `checked the bedside room — ${out.beds?.[0]?.verdict ?? ''}`
    case 'work_triangle': return out?.error ? null : `measured the kitchen work triangle — ${out.verdict}`
    case 'define_flat': return out?.refused ? `asked to build a home over this room — ${said(out)}` : `laid out a ${out?.flat} — ${out?.rooms?.length} rooms, ${out?.total_m2}m² in all`
    case 'rooms': return out?.error ? null : `looked over the whole home — ${out.rooms?.length} rooms${out.score_of_the_furnished_rooms ? `, ${out.score_of_the_furnished_rooms}/100 across the furnished ones` : ', none furnished yet'}${out.unfurnished ? ` (${out.unfurnished.length} still empty)` : ''}`
    case 'enter_room': return out?.error ? null : `walked into the ${String(out.you_are_in).toLowerCase()} — judged as ${out.judged_as} now`
    case 'plan_sheet': return out?.error ? null : `drew a printable plan — “${out.opened}”, ${out.pieces} pieces, ready to print or save as a PDF`
    case 'preset': return out?.refused ? `asked to load the “${a.id}” scene — ${said(out)}` : a.id ? `loaded the “${a.id}” scene` : null
    default: return null
  }
}

export const TOOLS = T
export const RULES_FOR = (p: Profile): Rule[] => PROFILE_RULES[p]
/** the tools that make sense in the current state — this is what the agent can actually see */
export const activeTools = () => [...T.filter(t => !t.when || t.when()).map(t => t.name),
  ...(state.nudge ? ['read_message_from_human'] : [])]

/** Register with WebMCP. Tools are registered and unregistered as the room changes, so the agent's
 *  list is always the tools that apply right now; Chrome fires `toolchange` for us. */
/** Put a whole home on screen, and leave an address that brings it back. Three callers used to do
 *  this three slightly different ways, and only one of them cleared the room that was on screen. */
export const showFlat = (f: Flat) => {
  set({ flat: f, here: null, presetId: 'flat', layouts: {}, baseline: null, notes: [], history: [],
    room: f.rooms[0].room, items: [], profile: 'general', brief: null, selected: null, eye: null, path: null, spot: null })
  try {
    const q = new URLSearchParams(location.search); q.delete('preset'); q.set('home', homeParam(f))
    history.replaceState(null, '', `?${q}`)
  } catch { /* no URL bar to update */ }
}

/** ?home=2b4p — rebuild that home on load. `preset=flat` is what older links say; it names a home
 *  without saying which, so it gets the one the landing page offers first. */
/** What a URL asks the page to open, and in which order. A link someone sent wins, then a home
 *  address, then a scene — and the last session is NOT restored automatically: the landing offers it
 *  as a card, so arriving somewhere you did not ask for never happens and a first look at the page is
 *  always the same first look. That precedence lived in main.tsx, which runs at import and so could
 *  not be tested; a shared link losing to a stale ?preset= would open the wrong room silently. */
export const openFrom = (search: string, hash: string): boolean => {
  const shared = hash.match(/^#l=(.+)$/)?.[1]
  if (shared && loadShare(shared)) return true
  const q = new URLSearchParams(search)
  const id = q.get('preset')
  const home = q.get('home') ?? (id === 'flat' ? 'flat' : null)
  if (home) return loadHome(home)
  return id ? loadPreset(id) : false
}

export const loadHome = (raw: string): boolean => {
  const f = raw === 'flat' ? buildFlat(2, 4) : homeFromParam(raw)
  if (f) showFlat(f)
  return !!f
}

/** A tool as the agent actually meets it: arguments coerced, the result stringified, what the human
 *  did since the last call attached, and one line written into the transcript. Registration uses it,
 *  window.room uses it, and so do the tests — driving t.run() straight past this was testing a path
 *  no agent takes. */
export const wrap = (t: Tool) => ({
  name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
  annotations: { readOnlyHint: !!t.readOnly, ...(t.untrusted ? { untrustedContentHint: true } : {}), ...(t.destructive ? { destructiveHint: true } : {}) },
  async execute(args: unknown) {
    const t0 = performance.now()
    let out: unknown
    try { out = await t.run(coerce(t, args)) } catch (e) { out = { error: String(e) } }
    // every tool reports what the human did since the agent's last call — not just the mutating ones
    if (out && typeof out === 'object' && !Array.isArray(out) && !('humanChanges' in out)) {
      const hc = drainHuman(); if (hc.length) (out as any).humanChanges = hc
    }
    logCall(t.name, args, Math.round(performance.now() - t0))
    try { const line = plain(t.name, coerce(t, args), out); if (line) feed('agent', line) } catch { /* a transcript line is never worth failing a tool call over */ }
    const failed = !!(out && typeof out === 'object' && 'error' in (out as any))
    return { content: [{ type: 'text', text: JSON.stringify(out) }], ...(failed ? { isError: true } : {}) }
  },
})

/** Reading the human's message takes it away again — "when your agent reads it, this disappears".
 *  This lived twice, once on window.room and once inside the registration, and the second copy was
 *  the one no test could reach. Two spellings of the same tool is how a demo drifts from what an
 *  agent actually gets, which is the reason window.room exists in the first place. */
const readMessage = () => { const n = state.nudge
  if (!n) return { message: null, ...base() }
  // clear AFTER the result is returned: aborting a tool while Chrome is still inside executeTool
  // crashes the call (verified in Chrome 152)
  setTimeout(clearNudge, 0)
  return { message: n.text, ...base() }
}

export function registerTools() {
  // window.room always exposes everything, for DevTools and for agents without WebMCP
  ;(window as any).room = { list_tools: async () => activeTools(), all_tools: async () => T.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })), ...Object.fromEntries(T.map(t => [t.name, (a?: unknown) => wrap(t).execute(a).then(r => JSON.parse(r.content[0].text))])),
    read_message_from_human: async () => readMessage() }

  const mc: any = (navigator as any).modelContext ?? (document as any).modelContext
  const registered = new Map<string, AbortController>()
  // ---- page → agent: the only push channel WebMCP has is the tool list itself ----
  // A transient tool named read_message_from_human carries the message IN ITS DESCRIPTION. Registering it
  // fires `toolchange` in the browser, so a client that re-lists sees the page speak first. Calling it
  // returns the message plus everything else the human did, and the tool disappears again.
  const NUDGE = 'read_message_from_human'
  let nudgeAt = 0
  const syncNudge = () => {
    if (!mc) return
    const n = state.nudge
    if (n && n.t !== nudgeAt) {
      registered.get(NUDGE)?.abort(); registered.delete(NUDGE)
      const ac = new AbortController(); registered.set(NUDGE, ac); nudgeAt = n.t
      const t: Tool = { name: NUDGE, title: 'The human has something to say', description: `NEW MESSAGE FROM THE HUMAN (${new Date(n.t).toLocaleTimeString()}): ${n.text} — Call this to acknowledge it; it returns the full list of what they did.`, inputSchema: { type: 'object', properties: {} },
        // unregister AFTER the result has been returned: aborting a tool while Chrome is still inside
        // executeTool crashes the call (verified in Chrome 152)
        run: readMessage }
      const retry = () => { registered.delete(NUDGE); nudgeAt = 0; setTimeout(() => set({}), 30) } // abort may land a tick late; try again
      try { Promise.resolve(mc.registerTool(wrap(t), { signal: ac.signal })).catch(retry) } catch { retry() }
    } else if (!n && registered.has(NUDGE)) { registered.get(NUDGE)!.abort(); registered.delete(NUDGE); nudgeAt = 0 }
  }
  const sync = () => {
    const want = new Set(activeTools())
    if (mc) {
      for (const [n, ac] of registered) if (!want.has(n) && n !== NUDGE) { ac.abort(); registered.delete(n) }
      for (const t of T) if (want.has(t.name) && !registered.has(t.name)) {
        const ac = new AbortController(); registered.set(t.name, ac)
        try { Promise.resolve(mc.registerTool(wrap(t), { signal: ac.signal })).catch(() => registered.delete(t.name)) }
        catch { registered.delete(t.name) }
      }
      syncNudge()
    }
    const names = [...want].sort()
    if (names.join() !== state.mcpTools.join()) set({ mcpTools: names }) // guarded: set() re-enters sync
  }
  if (!mc) { set({ mcp: 'missing' }); sync(); subscribe(sync); return }
  try { if (!mc.registerTool) throw new Error('no registerTool'); sync(); set({ mcp: 'ok' }) }
  catch (e) { console.warn('WebMCP registration failed', e); set({ mcp: 'missing' }) }
  subscribe(sync)
}
