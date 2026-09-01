import type { Item, Profile, Room } from './store'

/** A flat is not one big room, and pretending otherwise is how a "studio planner" ends up unable to
 *  say anything true about a home. Each room keeps its own geometry, its own furniture and its own
 *  rules — a bedroom is judged on where you can walk beside a bed, a kitchen on whether you can open
 *  the oven. You work in one room at a time, and the agent's tool list changes with the room it is
 *  standing in. ponytail: rooms are stored side by side rather than modelled as one polygon with
 *  internal walls — the rules engine already knows how to judge a rectangle, and this needs no new
 *  geometry. Shared walls and doorways between rooms are the upgrade if it ever matters. */
export type RoomKind = 'hall' | 'bedroom' | 'kitchen' | 'bath' | 'study' | 'balcony'

export type FlatRoom = {
  id: string
  name: string
  kind: RoomKind
  /** where this room sits inside the flat, in cm from the flat's top-left. Rooms are laid out in
   *  columns so the plan reads like a plan: living space on one side, sleeping on the other, the
   *  wet rooms together. The rules still judge each room on its own — this is what you SEE. */
  x: number
  y: number
  /** how many of the household sleep or work in THIS room; drives the per-room brief */
  people: number
  room: Room
  items: Item[]
  /** the agent's A/B options for THIS room. They used to be cleared on the way out, so an option
   *  saved in a bedroom was gone by the time you walked back into it. */
  layouts?: Record<string, Item[]>
}

export type Flat = { name: string; bedrooms: number; people: number; rooms: FlatRoom[] }

/** Wall thickness between rooms. Real internal walls are 10–12cm; the drawing needs them to read as
 *  walls rather than as a gap. */
export const WALL = 12

/** Stack the rooms into columns: the hall on its own, bedrooms down the middle, the kitchen and
 *  bathroom together on the end, because that is how the pipes run. Returns the flat's outer size. */
export function layoutFlat(rooms: FlatRoom[]): { w: number; h: number } {
  // Rooms go into columns in the order a flat is usually read — living, then sleeping, then the wet
  // rooms — but each one lands in whichever column is currently SHORTEST. Filling column by column
  // made an eight-room flat 1164 wide and 1296 tall, a tower with the hall floating above a void.
  // Homes are wider than they are tall.
  const order: RoomKind[] = ['hall', 'bedroom', 'study', 'kitchen', 'bath', 'balcony']
  const queue = [...rooms].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
  const tall = (c: FlatRoom[]) => c.reduce((t, r) => t + r.room.h + WALL, 0)

  const pack = (n: number) => {
    const cols: FlatRoom[][] = Array.from({ length: n }, () => [])
    for (const r of queue) cols.sort((a, b) => tall(a) - tall(b))[0].push(r)
    let x = 0
    for (const c of cols.filter(c => c.length)) {
      let y = 0
      for (const r of c) { r.x = x; r.y = y; y += r.room.h + WALL }
      x += Math.max(...c.map(r => r.room.w)) + WALL
    }
    return { w: Math.max(...rooms.map(r => r.x + r.room.w)), h: Math.max(...rooms.map(r => r.y + r.room.h)) }
  }

  // Rather than guess the column count, add columns until the home stops being taller than it is
  // wide. Two bedrooms and a bathroom stacked in one column made a tower; the fix is one more column,
  // and the only way to know how many is to lay it out and look.
  let size = pack(2)
  for (let n = 3; n <= 5 && size.h > size.w; n++) size = pack(n)
  return size
}

/** the goal each kind of room is judged against — a bedroom and a study want different things */
export const KIND_PROFILE: Record<RoomKind, Profile> = {
  hall: 'general', bedroom: 'bedroom', kitchen: 'general',
  bath: 'accessibility', study: 'office', balcony: 'general',
}

export const KIND_NOTE: Record<RoomKind, string> = {
  hall: 'where the household sits together — seating that forms one group, and a way through it',
  bedroom: 'a bed you can walk beside on the side you get out of, and storage that is not in the way',
  kitchen: 'worktop you can stand at, and doors and drawers that open without hitting anything',
  bath: 'judged on accessibility by default — a door that swings clear and room to turn',
  study: 'a desk per person, light on it, a socket in reach, nobody with their back to the door',
  balcony: 'somewhere to sit that does not block the way back in',
}

const D = (wall: 'N' | 'S' | 'E' | 'W', pos: number, width = 80) => ({ id: 'door', wall, pos, width })
const W = (id: string, wall: 'N' | 'S' | 'E' | 'W', pos: number, width: number) => ({ id, wall, pos, width })

/** Sizes are ordinary, not generous: a real 2BHK is about 85m², and the interesting problems only
 *  appear when a room is the size people actually live in. */
const SHELL: Record<RoomKind, (n: number) => Room> = {
  hall: () => ({ w: 460, h: 380, doors: [D('S', 190, 90)], windows: [W('north window', 'N', 120, 200)], outlets: [{ x: 0, y: 150 }, { x: 460, y: 220 }, { x: 250, y: 380 }] }),
  bedroom: n => n > 1
    ? { w: 380, h: 340, doors: [D('S', 40)], windows: [W('east window', 'E', 90, 160)], outlets: [{ x: 380, y: 60 }, { x: 0, y: 200 }, { x: 200, y: 340 }] }
    : { w: 320, h: 300, doors: [D('S', 30)], windows: [W('north window', 'N', 90, 140)], outlets: [{ x: 320, y: 80 }, { x: 0, y: 180 }] },
  kitchen: () => ({ w: 260, h: 220, doors: [D('S', 90)], windows: [W('west window', 'W', 60, 120)], outlets: [{ x: 260, y: 60 }, { x: 0, y: 160 }, { x: 130, y: 0 }] }),
  // Measured against this room's own door and window, not guessed: a bathroom is judged on
  // accessibility by default, and below 300x280 the page cannot fit a toilet, a basin AND a shower
  // without taking away the turning circle beside one of them. The default shipped 180x210, a room
  // no agent could finish — and every attempt at it read as the agent being stupid.
  bath: () => ({ w: 300, h: 280, doors: [D('S', 50, 75)], windows: [W('north window', 'N', 60, 60)], outlets: [{ x: 300, y: 40 }] }),
  study: () => ({ w: 300, h: 280, doors: [D('S', 40)], windows: [W('east window', 'E', 70, 140)], outlets: [{ x: 300, y: 90 }, { x: 0, y: 190 }] }),
  balcony: () => ({ w: 300, h: 130, doors: [D('N', 110, 90)], windows: [], outlets: [] }),
}

/** Spread `people` across the bedrooms the way a household actually does: the first bedroom takes
 *  the couple, the rest take one each, and anyone left over shares. */
export function sleepers(people: number, bedrooms: number): number[] {
  const out: number[] = Array(bedrooms).fill(0)
  const pp = Math.max(1, people)
  out[0] = Math.min(2, pp)                      // the main bedroom takes the couple
  let left = pp - out[0]
  if (bedrooms === 1) return [pp]
  // and everybody else spreads evenly over the rest, rather than piling back into the first one
  for (let i = 1; left > 0; i = i + 1 > bedrooms - 1 ? 1 : i + 1) { out[i]++; left-- }
  return out
}

/** A home in a URL. "2b4p", "3b5p-study-balcony" — the shell and nothing more; furniture belongs to
 *  the saved session, not the address bar. Without this a reload of a home landed back on the front
 *  page, on a URL the app had written itself. */
export const homeParam = (f: Flat): string =>
  `${f.rooms.filter(r => r.kind === 'bedroom').length}b${f.rooms.find(r => r.kind === 'hall')?.people ?? 1}p`
  + f.rooms.filter(r => r.kind === 'study' || r.kind === 'balcony').map(r => `-${r.kind}`).join('')

export const homeFromParam = (raw: string): Flat | null => {
  const m = /^(\d)b(\d{1,2})p((?:-(?:study|balcony))*)$/.exec(raw.trim())
  return m ? buildFlat(+m[1], +m[2], m[3].split('-').filter(Boolean) as RoomKind[]) : null
}

export function buildFlat(bedrooms: number, people: number, extras: RoomKind[] = []): Flat {
  // A home has one study and one balcony. Asking for three studies — which define_flat, a ?home= URL
  // and a share link all allowed — built three rooms that all answered to the id "study", so
  // enter_room reached the first and the other two could not be addressed at all. All three doors
  // come through here.
  extras = [...new Set(extras)]
  const bn = Math.max(1, Math.min(4, Math.round(bedrooms) || 1))
  const pp = Math.max(1, Math.min(12, Math.round(people) || 1))
  const beds = sleepers(pp, bn)
  const rooms: FlatRoom[] = [
    { id: 'hall', name: 'Hall', kind: 'hall', people: pp, x: 0, y: 0, room: SHELL.hall(pp), items: [] },
    ...beds.map((n, i) => ({
      id: `bed${i + 1}`, name: bn === 1 ? 'Bedroom' : `Bedroom ${i + 1}`,
      kind: 'bedroom' as const, people: n, x: 0, y: 0, room: SHELL.bedroom(n), items: [],
    })),
    { id: 'kitchen', name: 'Kitchen', kind: 'kitchen', people: pp, x: 0, y: 0, room: SHELL.kitchen(pp), items: [] },
    { id: 'bath', name: 'Bathroom', kind: 'bath', people: pp, x: 0, y: 0, room: SHELL.bath(pp), items: [] },
    ...extras.filter(k => k === 'study' || k === 'balcony').map(k => ({
      id: k, name: k === 'study' ? 'Study' : 'Balcony', kind: k, people: k === 'study' ? Math.min(2, pp) : pp,
      x: 0, y: 0, room: SHELL[k](pp), items: [],
    })),
  ]
  layoutFlat(rooms)
  return { name: `${bn}BHK for ${pp}`, bedrooms: bn, people: pp, rooms }
}

export const areaM2 = (f: Flat) => Math.round(f.rooms.reduce((t, r) => t + r.room.w * r.room.h, 0) / 10000 * 10) / 10

/** the flat's outer envelope, for drawing it whole */
export const flatSize = (f: Flat) => ({
  w: Math.max(...f.rooms.map(r => r.x + r.room.w)),
  h: Math.max(...f.rooms.map(r => r.y + r.room.h)),
})

export const sleepersNote = (f: Flat) =>
  f.rooms.filter(r => r.kind === 'bedroom').map(r => `${r.name}: ${r.people}`).join(', ')
