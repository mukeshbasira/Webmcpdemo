import { spec, type ItemType } from './catalog'
import { center, dist, doorClearance, footprint, front, hits, inside, type Rect } from './rules'
import { state, type Item, type Rot } from './store'

export type Dock = { host: ItemType[]; where: 'front' | 'around' | 'beside' | 'under'; gap: number; note: string }

/** furniture that belongs *with* another piece, and how it sits */
export const DOCK: Partial<Record<ItemType, Dock>> = {
  chair:        { host: ['desk', 'dining_table'], where: 'front',  gap: 6,   note: 'tucked in at the edge, facing the table' },
  coffee_table: { host: ['sofa'],                 where: 'front',  gap: 45,  note: '45cm in front of the sofa — reachable without standing' },
  rug:          { host: ['sofa'],                 where: 'under',  gap: 0,   note: 'under the front legs of the seating group' },
  lamp:         { host: ['sofa', 'armchair', 'desk'], where: 'beside', gap: 15, note: 'at the end of the seat, level with the shoulder' },
  wall_sconce:  { host: ['bed_double', 'bed_single'], where: 'beside', gap: 10, note: 'above the bedside, both sides if there are two' },
  pendant:      { host: ['dining_table', 'desk'], where: 'under',  gap: 0,   note: 'centred over the table, nothing else in the way' },
}

const opposite = (r: Rot) => ((r + 180) % 360) as Rot

/** where should `type` sit relative to `host`? returns the placement or null */
export function dockPosition(type: ItemType, host: Item, w: number, h: number, index = 0, count = 1): { x: number; y: number; rot: Rot } | null {
  const d = DOCK[type]; if (!d || !d.host.includes(host.type)) return null
  const hf = footprint(host), hc = center(hf), f = front(host.rot)
  const perp = { x: -f.y, y: f.x }
  const snap10 = (n: number) => Math.round(n / 10) * 10
  const place = (cx: number, cy: number, rot: Rot) => ({ x: snap10(cx - (rot % 180 ? h : w) / 2), y: snap10(cy - (rot % 180 ? w : h) / 2), rot })

  // A rug centred on a sofa that stands near a wall lands partly outside the room, and every caller
  // then refuses it — including the pairing violation whose own fix text names this exact call. Under
  // means under: slide it back inside rather than fail, which still leaves it beneath the seating.
  if (d.where === 'under') {
    const p = place(hc.x, hc.y, host.rot)
    const pw = p.rot % 180 ? h : w, ph = p.rot % 180 ? w : h
    return { ...p, x: snap10(Math.max(0, Math.min(state.room.w - pw, p.x))), y: snap10(Math.max(0, Math.min(state.room.h - ph, p.y))) }
  }
  if (d.where === 'front') {
    // sit in front of the host's face, turned to look back at it.
    // half-extents must be measured ALONG the facing direction, not by raw w/h
    const myRot = type === 'coffee_table' ? host.rot : opposite(host.rot)
    const myW = myRot % 180 ? h : w, myH = myRot % 180 ? w : h
    const along = (v: { x: number; y: number }, W: number, H: number) => (Math.abs(v.x) > Math.abs(v.y) ? W : H) / 2
    const depth = along(f, hf.w, hf.h) + d.gap + along(f, myW, myH)
    if (host.type === 'dining_table' && count > 1) {
      // spread evenly around the four sides
      // long sides first (0=S, 180=N), then the ends — how people actually sit
      const ORDER: Rot[] = [0, 180, 90, 270]
      const side = ORDER[index % 4], sf = front(side)
      const round_ = Math.floor(index / 4), off = round_ === 0 ? 0 : (round_ % 2 ? -1 : 1) * Math.ceil(round_ / 2) * 60
      const reach = (Math.abs(sf.x) > Math.abs(sf.y) ? hf.w : hf.h) / 2 + d.gap + (Math.abs(sf.x) > Math.abs(sf.y) ? h : h) / 2
      const p2 = { x: -sf.y, y: sf.x }
      return place(hc.x + sf.x * reach + p2.x * off, hc.y + sf.y * reach + p2.y * off, opposite(side))
    }
    return place(hc.x + f.x * depth, hc.y + f.y * depth, myRot)
  }
  // beside: at the end of the host, on the free side, facing the same way
  const reach = (Math.abs(perp.x) > Math.abs(perp.y) ? hf.w : hf.h) / 2 + d.gap + (Math.abs(perp.x) > Math.abs(perp.y) ? w : h) / 2
  const sign = index % 2 === 0 ? 1 : -1
  return place(hc.x + perp.x * reach * sign, hc.y + perp.y * reach * sign, host.rot)
}

/** does this item look docked to its host right now? */
/** Is this piece sitting where it belongs relative to `host`? `siblings` matters: chairs are spread
 *  around a dining table by index, so checking only position 0 says every chair but one is adrift. */
export function isDocked(it: Item, host: Item, siblings = 1): boolean {
  const a = footprint(it)
  for (let k = 0; k < Math.max(1, Math.min(6, siblings)); k++) {
    const p = dockPosition(it.type, host, it.w, it.h, k, siblings)
    if (!p) return true
    const b = footprint({ ...it, ...p })
    if (Math.hypot(a.x - b.x, a.y - b.y) < 60) return true
  }
  return false
}

/** The host THIS piece belongs to — the one it is already docked to, else the nearest.
 *  Taking the first item of the right type meant every chair in the room belonged to desk_1, so five
 *  chairs docked to five desks still read as five chairs adrift from one. */
export function hostFor(it: Item): Item | undefined {
  const d = DOCK[it.type]; if (!d) return undefined
  const hosts = state.items.filter(h => !h.parked && d.host.includes(h.type))
  if (!hosts.length) return undefined
  const sibs = state.items.filter(i => i.type === it.type && !i.parked).length
  const c = center(footprint(it))
  return hosts.find(h => isDocked(it, h, sibs))
    ?? [...hosts].sort((a, b) => dist(c, center(footprint(a))) - dist(c, center(footprint(b))))[0]
}

/** Both places that dock a piece ask this first. It knew about walls and about other furniture and
 *  not about the door, so the page's own arranger stood a floor lamp in the doorway of the office
 *  scene and handed back "65 → 69, the number to beat" with a hard error in it. A door swing is not
 *  furniture and not a wall, which is exactly why it was missed twice. */
export const fits = (p: { x: number; y: number; rot: Rot }, w: number, h: number, ignore: string[], type?: ItemType) => {
  const r: Rect = { x: p.x, y: p.y, w: p.rot % 180 ? h : w, h: p.rot % 180 ? w : h }
  if (!inside(r, state.room)) return false
  // A rug may lie across a door swing and under the sofa; a floor lamp may do neither. Without this
  // the page printed "dock_item({id:'rug', to:'sofa'}) puts it there" as the fix for its own pairing
  // violation, and then refused that exact call — because a rug docked under a sofa overlaps the sofa,
  // which is the entire point of a rug.
  const flat = type ? !!(spec(type).passable || spec(type).ceiling) : false
  if (flat) return true
  if (state.room.doors.some(d => hits(doorClearance(state.room, d, state.profile), r))) return false
  return !state.items.some(i => !ignore.includes(i.id) && !spec(i.type).passable && !spec(i.type).ceiling && hits(footprint(i), r))
}
