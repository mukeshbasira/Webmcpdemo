import { spec, type ItemType } from './catalog'
import { DOCK, dockPosition, fits } from './dock'
import { PLUMBED, idIsName, check, center, dist, doorClearance, footprint, front, gap, hits, inside, wallCenter, wallStrip, type Rect } from './rules'
import { ROTS, flash, parkItem, push, state, updateItem, type Item, type Rot } from './store'

export type Prefer = 'wall' | 'corner' | 'center' | 'near_window' | 'near_outlet' | 'any'
export type Candidate = { x: number; y: number; rot: Rot; score: number; why: string }
export type FindResult = { candidates: Candidate[]; note?: string; caveat?: string; considered?: number; of_possible?: number; least_bad?: Candidate[]; planned_around?: number }


/** a placement the agent has decided on but not applied yet */
export type Pending = { type?: ItemType; w?: number; h?: number; x: number; y: number; rot?: Rot }

export function findSpace(w: number, h: number, type?: ItemType, prefer: Prefer = 'any', near?: string, facing?: string, plan: Pending[] = [], ignore: string[] = []): FindResult {
  const { room, profile } = state
  // treat the agent's own pending placements as if they were already in the room, so a batch of
  // find_space calls made before move_items cannot return five spots that sit on top of each other
  const pending: Item[] = plan.map((p, i) => {
    const t = p.type && spec(p.type) ? p.type : undefined
    return { id: `_plan${i}`, type: t ?? 'coffee_table', x: p.x, y: p.y, rot: ((p.rot ?? 0) as Rot),
      w: p.w ?? (t ? spec(t).w : 60), h: p.h ?? (t ? spec(t).h : 60) }
  })
  // `ignore` = items the agent is about to move anyway. Without it, re-planning a full room is
  // impossible: every candidate is judged against the mess the agent is in the middle of clearing.
  const items = (pending.length || ignore.length)
    ? [...state.items.filter(i => !ignore.includes(i.id)), ...pending]
    : state.items
  // bigger than the room in every rotation: no amount of tidying will help, say so instead of
  // returning an empty list the agent will try to route around
  if (!((w <= room.w && h <= room.h) || (h <= room.w && w <= room.h)))
    return { candidates: [], note: `a ${w}×${h}cm footprint does not fit a ${room.w}×${room.h}cm room in any rotation — it is bigger than the room itself. Enlarge the room with set_room, or set the item aside with remove_item({keep:true}). Do NOT invent coordinates.` }
  const tall = type ? !!spec(type).tall : false
  // The rules know a sink needs a wall behind it and the search did not, so the search spent its whole
  // rule-checking budget on the mid-floor spots its preference liked best, every one of them illegal,
  // and reported that a 12m² kitchen had nowhere to put a sink. The search and the rules have to know
  // the same things: whatever must reach a wall is scored towards one.
  const wallish = type ? !!(spec(type).tall || spec(type).screen || spec(type).bed || PLUMBED[type]) : false
  // A rug lies UNDER the furniture — that is what the pairing rule asks for, "under the front legs of
  // the seating group". The search tested it for collisions like a wardrobe, so it produced zero
  // candidates for the rug in its own demo room and reported "no legal 230×160cm spot exists — the
  // room is too full". add_item had a workaround for the symptom; this is where it came from.
  const ceiling = type ? !!(spec(type).ceiling || spec(type).passable) : false
  const look = (id?: string) => (id ? items.find(i => i.id === id) ?? state.items.find(i => i.id === id) : undefined)
  /** A window, a door or a socket is a thing in this room the agent can name, even though none of
   *  them is an item. "the window" is the widest one — the one anybody means. */
  const opening = (word?: string): { c: Rect } | undefined => {
    const w = String(word ?? '').toLowerCase()
    const box = (p: { x: number; y: number }, wide: number) => ({ c: { x: p.x - wide / 2, y: p.y - wide / 2, w: wide, h: wide } })
    if (w === 'window' || w === 'the window') {
      const win = [...room.windows].sort((a, b) => b.width - a.width)[0]
      return win && box(wallCenter(room, win.wall, win.pos, win.width), Math.min(win.width, 120))
    }
    if (w === 'door' || w === 'the door') {
      const d = room.doors[0]
      return d && box(wallCenter(room, d.wall, d.pos, d.width), Math.min(d.width, 90))
    }
    if (w === 'outlet' || w === 'socket') {
      const o = room.outlets[0]
      return o && box(o, 30)
    }
    return undefined
  }
  const target = (id?: string) => { const it = look(id); if (it) return footprint(it); return opening(id)?.c }
  const nearR = target(near), faceR = target(facing)
  const nearC = nearR ? center(nearR) : undefined
  const faceC = faceR ? center(faceR) : undefined
  const solid = items.filter(i => !i.parked && !spec(i.type).passable && !spec(i.type).ceiling)
    .map(i => ({ id: i.id, name: idIsName(i) ? spec(i.type).label.toLowerCase() : `${spec(i.type).label.toLowerCase()} (${i.id})`, r: footprint(i) }))
  const doors = room.doors.map(d => doorClearance(room, d, profile))
  const winStrips = room.windows.map(x => wallStrip(room, x.wall, x.pos, x.width, 40))
  const winC = room.windows.map(x => wallCenter(room, x.wall, x.pos, x.width))
  const rc = { x: room.w / 2, y: room.h / 2 }
  const out: Candidate[] = []
  const blocked: Candidate[] = []
  const asRect = (c: Candidate) => ({ x: c.x, y: c.y, w: c.rot % 180 ? h : w, h: c.rot % 180 ? w : h })
  /** running top-3 of rejected spots, kept mutually non-overlapping — O(1) per candidate */
  const keepBlocked = (c: Candidate) => {
    const i = blocked.findIndex(b => hits(asRect(b), asRect(c)))
    if (i >= 0) { if (blocked[i].score >= c.score) return; blocked.splice(i, 1) }
    blocked.push(c); blocked.sort((a, b) => b.score - a.score); if (blocked.length > 3) blocked.pop()
  }

  for (const rot of ROTS) {
    const fw = rot % 180 ? h : w, fh = rot % 180 ? w : h
    for (let y = 0; y + fh <= room.h; y += 10) for (let x = 0; x + fw <= room.w; x += 10) {
      const r: Rect = { x, y, w: fw, h: fh }
      if (!inside(r, room)) continue
      if (!ceiling) {
        const clash = solid.filter(s => hits(s.r, r)), inDoor = doors.some(d => hits(d, r))
        if (clash.length || inDoor) {
          // the room may turn out to have no legal spot at all; keep the three cheapest wrongs
          keepBlocked({ x, y, rot, score: -(clash.length * 100 + (inDoor ? 250 : 0)) - Math.min(x, y, room.w - x - fw, room.h - y - fh) * 0.2,
            why: inDoor ? 'sits in the door swing' : `would clash with the ${clash.map(c => c.name).join(' and the ')}` })
          continue
        }
      }
      if (tall && winStrips.some(s => hits(s, r))) continue
      const c = center(r), f = front(rot)
      const wallD = Math.min(x, y, room.w - (x + fw), room.h - (y + fh))
      const cornerD = Math.min(Math.hypot(x, y), Math.hypot(room.w - x - fw, y), Math.hypot(x, room.h - y - fh), Math.hypot(room.w - x - fw, room.h - y - fh))
      // back-to-wall alignment: which wall is nearest, does -front point at it
      const walls = [{ d: y, n: { x: 0, y: -1 } }, { d: room.h - y - fh, n: { x: 0, y: 1 } }, { d: x, n: { x: -1, y: 0 } }, { d: room.w - x - fw, n: { x: 1, y: 0 } }]
      const nw = walls.reduce((a, b) => (a.d < b.d ? a : b))
      const backToWall = -(f.x * nw.n.x + f.y * nw.n.y) // 1 = back against nearest wall
      let s = 0, why = ''
      if (prefer === 'wall') { s -= wallD * 2 + (1 - backToWall) * 100; why = 'against wall' }
      else if (prefer === 'corner') { s -= cornerD * 2 + (1 - backToWall) * 100; why = 'in corner' }
      else if (prefer === 'center') { s -= dist(c, rc) * 2; why = 'centered' }
      else if (prefer === 'near_window') { s -= Math.min(...winC.map(p => dist(c, p)), 9999) * 2; why = 'near window' }
      else if (prefer === 'near_outlet') { s -= Math.max(0, Math.min(...room.outlets.map(p => gap(r, { ...p, w: 0, h: 0 })), 9999) - 140) * 3; why = 'near outlet' }
      else { s -= wallD * 0.2; why = 'free space' }
      if (wallish && prefer !== 'wall' && prefer !== 'corner') { const along = nw.n.x ? Math.abs(c.y - room.h / 2) : Math.abs(c.x - room.w / 2); s -= (1 - backToWall) * 120 + wallD * 0.5 + along * 0.4 } // desks, screens, beds, tall things: back to a wall, facing the room, centred on that wall
      if (nearC) s -= dist(c, nearC) * (type && spec(type).seat ? 1.6 : 0.5) // seats cluster into one conversation group
      if (faceC) { const v = { x: faceC.x - c.x, y: faceC.y - c.y }, d = Math.hypot(v.x, v.y) || 1; const cos = (v.x * f.x + v.y * f.y) / d
        const tgt = look(facing), tf_ = faceR!, minD = Math.min(tf_.w, tf_.h) / 2 + 20
        s += cos * 300; if (cos < 0.6 || d < minD) s -= 1000; else why += `, facing ${facing}`
        // sweet spot: TV ≈ 2× screen width away; desk chair right at the edge; anything else just close
        const ideal = tgt?.type === 'tv_unit' ? 2 * tgt.w : tgt?.type === 'desk' ? minD + 20 : minD + 10
        s -= Math.abs(d - ideal) * 3
        if (tgt) { const tf = front(tgt.rot); if ((c.x - faceC.x) * tf.x + (c.y - faceC.y) * tf.y <= 0) s -= 800 } // must sit on the target's front side (in front of the screen / desk)
        // a seat's line of sight to the screen must not cross another seat
        if (type && tgt && spec(type).seat && spec(tgt.type).screen) { const others = items.filter(i => spec(i.type).seat).map(footprint); const n = Math.ceil(d / 10)
          for (let k = 1; k < n; k++) { const px = c.x + (v.x * k) / n, py = c.y + (v.y * k) / n; if (others.some(o => px > o.x && px < o.x + o.w && py > o.y && py < o.y + o.h)) { s -= 600; why += ', view blocked'; break } } }
      }
      else if (prefer !== 'wall' && prefer !== 'corner' && !wallish && rot >= 180) continue // same footprint as 0/90, skip duplicates (unless orientation matters)
      out.push({ x, y, rot, score: s, why })
    }
  }
  out.sort((a, b) => b.score - a.score)
  // full-rule verification for the top few
  const verified: Candidate[] = []
  const id = '_probe'
  const before = check(room, items, profile)
  const baseWalk = before.filter(v => v.rule === 'walkway').length
  // Walkways had a "do not make it worse" guard and nothing else did, so a spot was accepted as long
  // as the piece being placed was legal — while it took away the turning circle beside the toilet
  // that was already there. That is why a 12m² bathroom still failed: the room was never too small,
  // the search was only ever protecting one piece at a time.
  const baseErr = before.filter(v => v.severity === 'error').length
  let broke = 0
  const fallback: Candidate[] = []
  const budget = room.w * room.h > 400_000 ? 12 : 40 // full rule-check per candidate is the cost; keep big rooms responsive
  // A preference orders the candidates; it does not make the ones it likes legal. Asked for a sink
  // near a window whose wall was already taken, all 40 spots in the budget failed and the reply said
  // "no legal 60×60cm spot exists — the room is too full" about a room with a free wall in it: the
  // legal spot was ranked 41st, because it was the furthest thing from the window. Giving up with 340
  // unexamined spots left is not the same statement as "there is nowhere", and the page was making
  // the second one. The budget still bounds the ordinary case; it is only widened when the answer
  // would otherwise be a refusal, which is the one moment being wrong is expensive.
  for (let n = 0; n < out.length; n++) {
    if (n >= budget && (verified.length || fallback.length || n >= budget * 5)) break
    const c = out[n]
    const probe: Item = { id, type: type ?? 'coffee_table', x: c.x, y: c.y, rot: c.rot, w, h }
    const vs = check(room, [...items, probe], profile)
    // reject if the probe itself errors, or if standing here breaks something that was fine before
    if (vs.some(v => v.items.includes(id) && v.severity === 'error')) { broke++; continue }
    if (vs.filter(v => v.severity === 'error').length > baseErr) { broke++; continue }
    if (vs.some(v => v.items.includes(id) && v.rule === 'walkway') || vs.filter(v => v.rule === 'walkway').length > baseWalk) {
      const byId = new Map(items.map(i => [i.id, idIsName(i) ? spec(i.type).label.toLowerCase() : `${spec(i.type).label.toLowerCase()} (${i.id})`]))
      const blocked = [...new Set(vs.filter(v => v.rule === 'walkway').flatMap(v => v.items).filter(x => x !== id))]
        .map(x => byId.get(x) ?? x)
      if (fallback.length < 3 && !fallback.some(f => hits({ x: f.x, y: f.y, w: f.rot % 180 ? h : w, h: f.rot % 180 ? w : h }, footprint(probe)))) fallback.push({ ...c, score: Math.round(c.score), why: c.why + (blocked.length ? ` — but cuts the path to ${blocked.join(', ')}` : ' — but leaves no path to it') })
      continue
    }
    if (verified.some(v => hits({ x: v.x, y: v.y, w: v.rot % 180 ? h : w, h: v.rot % 180 ? w : h }, footprint(probe)))) continue // candidates don't overlap each other
    verified.push({ ...c, score: Math.round(c.score) })
    if (verified.length === 5) break
  }
  if (verified.length) return { candidates: verified, ...(pending.length ? { planned_around: pending.length } : {}) }
  if (fallback.length) {
    const cut = [...new Set(fallback.flatMap(f => (f.why.match(/cuts the path to (.+)$/)?.[1] ?? '').split(', ')).filter(Boolean))]
    return { candidates: fallback,
      caveat: cut.length
        ? `every free ${w}×${h}cm spot narrows the way to ${cut.slice(0, 4).join(', ')} — move ${cut.length === 1 ? 'it' : 'those'} first, or take a spot and accept the squeeze`
        : `every free ${w}×${h}cm spot leaves no way through to it — something has to move first` }
  }
  // nothing is legal. Hand back the least-damaging spots and name what each would hit, so the agent
  // still has real coordinates to negotiate with instead of inventing its own.
  // `considered: 59, rejected: {error: 40, walkway: 0, overlap: 0}` did not add up, and could not:
  // `out.length` counts what the cheap pass produced, while only the best `budget` of them are ever
  // rule-checked. The other two keys are structurally zero here — a walkway rejection fills
  // `fallback` and returns above, and nothing can overlap a verified candidate when there are none.
  // So the breakdown was one real number and two zeroes that read as "we looked and found nothing".
  return { candidates: [], considered: broke, ...(out.length > broke ? { of_possible: out.length } : {}),
    // The advice used to LEAD with "set something aside", and an agent that took it emptied a quarter
    // of the room. Nothing is stuck here: a full room has no spot for a sofa while the old furniture
    // is still standing, and the way out is to move the set together, which is what the page's own
    // arranger does. Setting furniture aside is last, and it is not free.
    note: `no legal ${w}×${h}cm spot exists WHILE THE ROOM STAYS AS IT IS — that is not the same as "it does not fit". Do NOT invent coordinates. In order: (1) plan the pieces together — call this again with ignore:[every id you are about to move] and plan:[what you have chosen so far], which is how the room holds furniture that will not go in one piece at a time; (2) enlarge the room with set_room; (3) take one of the least_bad spots below and tell the human exactly what it costs. Setting a piece aside is the last resort, not the first — furniture left out of the room counts against the score.`,
    least_bad: blocked.map(c => ({ ...c, score: Math.round(c.score) })) }
}

/** 214cm as 7' 0\" — the page never mixes units, it just says both */
export const imperial = (cm: number) => {
  const total = Math.round(cm / 2.54)
  if (total < 24) return `${total}"`                 // designers say "18 inches", not "1 foot 6"
  const ft = Math.floor(total / 12), inch = total % 12
  return inch ? `${ft}' ${inch}"` : `${ft}'`
}

export function measure(a: string, b: string) {
  const A = state.items.find(i => i.id === a), B = state.items.find(i => i.id === b)
  if (!A || !B) return { error: 'unknown item id' }
  const fa = footprint(A), fb = footprint(B)
  const e = Math.round(gap(fa, fb)), c = Math.round(dist(center(fa), center(fb)))
  // mixing units is the quietest way to be wrong: say both, every time, so nobody has to convert
  return { edge_to_edge: e, center_to_center: c, units: 'cm',
    edge_to_edge_imperial: imperial(e), center_to_center_imperial: imperial(c) }
}

/** greedy auto-arrange for the current goal: anchors first, then seats facing them, then the rest */
const PLAN: Record<string, { prefer: Prefer; facing?: 'screen' | 'seat'; near?: 'seat' | 'screen' }> = {
  bed_double: { prefer: 'wall' }, bed_single: { prefer: 'wall' }, tv_unit: { prefer: 'near_outlet' }, desk: { prefer: 'near_outlet' },
  sofa: { prefer: 'any', facing: 'screen' }, armchair: { prefer: 'any', facing: 'screen', near: 'seat' }, chair: { prefer: 'any', facing: 'screen', near: 'screen' },
  wardrobe: { prefer: 'wall' }, bookshelf: { prefer: 'wall' }, dining_table: { prefer: 'center' }, coffee_table: { prefer: 'any', facing: 'seat' },
  lamp: { prefer: 'near_outlet' }, plant: { prefer: 'corner' }, rug: { prefer: 'any', facing: 'seat' },
  ceiling_light: { prefer: 'center' }, downlights: { prefer: 'center' }, chandelier: { prefer: 'center' },
  pendant: { prefer: 'any', near: 'seat' }, spotlight_bar: { prefer: 'wall' }, track_light: { prefer: 'wall' }, cove_strip: { prefer: 'wall' }, wall_sconce: { prefer: 'wall' },
}
const ORDER = Object.keys(PLAN)
export function autoLayout() {
  // park everything outside the room first so nothing blocks the search, then place in priority order
  push()
  const rank = (t: ItemType) => { const i = ORDER.indexOf(t); return i < 0 ? ORDER.length : i } // unknown types go last, never before the anchors
  const order = [...state.items].sort((a, b) => rank(a.type) - rank(b.type))
  for (const it of order) if (it.parked) updateItem(it.id, { parked: undefined }) // re-try everything
  for (const it of order) updateItem(it.id, { x: -1000, y: -1000 })
  const placed: string[] = [], stuck: string[] = [], caveats: { id: string; why: string }[] = []
  const perHost: Record<string, number> = {}
  for (const it of order) {
    // companions dock to their host (chair at the desk, coffee table in front of the sofa)
    const d = DOCK[it.type]
    if (d) {
      // spread them across the available hosts, least-loaded first: five chairs at five desks, not
      // five chairs stacked around desk_1 (which is what made the baseline score 45)
      const hosts = state.items.filter(h => !h.parked && d.host.includes(h.type) && h.x >= 0)
      const host = hosts.sort((a, b) => (perHost[a.id] ?? 0) - (perHost[b.id] ?? 0))[0]
      if (host) {
        const sameType = state.items.filter(i => i.type === it.type).length
        const siblings = Math.max(1, Math.ceil(sameType / hosts.length))   // how many will end up at THIS host
        const idx = perHost[host.id] ?? 0
        for (let k = 0; k < 4; k++) { const p = dockPosition(it.type, host, it.w, it.h, idx + k, siblings)
          if (p && fits(p, it.w, it.h, [it.id], it.type)) { updateItem(it.id, p); placed.push(it.id); perHost[host.id] = idx + k + 1; break } }
        if (placed.includes(it.id)) continue
      }
    }
    const p = PLAN[it.type] ?? { prefer: 'any' as Prefer }
    const live = state.items.filter(i => i.x >= 0)
    const screen = live.find(i => spec(i.type).screen)?.id, seat = live.find(i => i.type === 'sofa')?.id ?? live.find(i => spec(i.type).seat)?.id
    const facing = p.facing === 'screen' ? screen : p.facing === 'seat' ? seat : undefined, near = p.near === 'seat' ? seat : p.near === 'screen' ? screen : undefined
    const r = findSpace(it.w, it.h, it.type, p.prefer, near, facing)
    const c = r.candidates[0]
    if (c) { updateItem(it.id, { x: c.x, y: c.y, rot: c.rot }); placed.push(it.id); if (r.caveat) caveats.push({ id: it.id, why: c.why }) }
    else { parkItem(it.id); stuck.push(it.id) } // set aside instead of piling it on the door
  }
  flash(placed)
  return { placed, stuck, caveats, note: caveats.length ? 'some items could only go where they narrow a walkway — check violations and adjust' : undefined }
}
