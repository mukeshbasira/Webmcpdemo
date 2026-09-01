import { spec, type ItemType } from './catalog'
import { center, dist, footprint } from './rules'
import type { Item, Room } from './store'

export type Fixture = { reach: number; kelvin: number; kind: 'ambient' | 'task' | 'accent' | 'mood'; height: number; note: string }

/** how each fixture actually behaves. reach = cm it usefully lights; kelvin = colour temperature */
export const FIXTURE: Partial<Record<ItemType, Fixture>> = {
  ceiling_light: { reach: 300, kelvin: 4000, kind: 'ambient', height: 250, note: 'flat general light, no shadows to work by' },
  downlights:    { reach: 340, kelvin: 3500, kind: 'ambient', height: 250, note: 'even wash over a wide area, the safest base layer' },
  pendant:       { reach: 180, kelvin: 2700, kind: 'task',    height: 180, note: 'pool of warm light — hang it over a table or an island, not in a walkway' },
  chandelier:    { reach: 260, kelvin: 2700, kind: 'mood',    height: 200, note: 'decorative centrepiece; needs 2.4 m of headroom under it' },
  track_light:   { reach: 260, kelvin: 3000, kind: 'accent',  height: 245, note: 'aimable heads — good for washing a wall or a bookshelf' },
  spotlight_bar: { reach: 220, kelvin: 3000, kind: 'accent',  height: 245, note: 'directional, picks out one zone' },
  cove_strip:    { reach: 200, kelvin: 2400, kind: 'mood',    height: 245, note: 'indirect glow off the ceiling — atmosphere, not enough to read by' },
  wall_sconce:   { reach: 150, kelvin: 2700, kind: 'mood',    height: 160, note: 'soft light at eye level, flattering on video calls' },
  lamp:          { reach: 200, kelvin: 2700, kind: 'task',    height: 150, note: 'movable warm light beside a seat' },
}

export const isLight = (t: ItemType) => t in FIXTURE
export const fixture = (t: ItemType) => FIXTURE[t]!

/** what needs light, and what kind */
export const needsLight = (t: ItemType): 'task' | 'ambient' | null =>
  t === 'desk' || t === 'dining_table' ? 'task' : spec(t).seat || spec(t).bed || spec(t).screen ? 'ambient' : null

export type LightReport = {
  fixtures: { id: string; type: string; kind: string; kelvin: number; reach_cm: number }[]
  layers: { ambient: number; task: number; accent: number; mood: number }
  zones: { id: string; label: string; needs: string; lit_by: string[]; nearest_cm: number; verdict: string }[]
  average_kelvin: number | null
  mood: string
  advice: string[]
}

/** ponytail: the room is not consulted — coverage is measured from the fixtures themselves.
 *  Kept in the signature because a report that ignores the room's size is a thing to revisit. */
export function lightReport(_room: Room, items: Item[]): LightReport {
  const F = new Map(items.map(i => [i.id, footprint(i)]))
  const lights = items.filter(i => isLight(i.type))
  const layers = { ambient: 0, task: 0, accent: 0, mood: 0 }
  for (const l of lights) layers[fixture(l.type).kind]++
  const zones = items.filter(i => needsLight(i.type)).map(z => {
    const need = needsLight(z.type)!
    const lit = lights.filter(l => dist(center(F.get(l.id)!), center(F.get(z.id)!)) <= fixture(l.type).reach)
    const nearest = lights.length ? Math.round(Math.min(...lights.map(l => dist(center(F.get(l.id)!), center(F.get(z.id)!))))) : -1
    const hasRight = lit.some(l => (need === 'task' ? fixture(l.type).kind === 'task' : true))
    return { id: z.id, label: spec(z.type).label, needs: need, lit_by: lit.map(l => l.id), nearest_cm: nearest,
      verdict: !lit.length ? 'dark' : hasRight ? 'fine' : need === 'task' ? 'lit but no task light — you would work in your own shadow' : 'fine' }
  })
  const k = lights.length ? Math.round(lights.reduce((a, l) => a + fixture(l.type).kelvin, 0) / lights.length) : null
  const spread = lights.length > 1 ? Math.max(...lights.map(l => fixture(l.type).kelvin)) - Math.min(...lights.map(l => fixture(l.type).kelvin)) : 0
  const advice: string[] = []
  if (!layers.ambient) advice.push('no ambient layer — add downlights or a ceiling light so the room has a base level')
  if (!layers.task && items.some(i => needsLight(i.type) === 'task')) advice.push('no task light over the desk/table — add a pendant or a floor lamp')
  if (!layers.accent && !layers.mood && lights.length) advice.push('one flat layer only; a cove strip or sconces would give the room depth after dark')
  if (spread > 1200) advice.push(`mixed colour temperatures (${spread}K apart) — warm and cold light in one room reads as cheap`)
  if (lights.length > 6) advice.push('a lot of fixtures; too many pools of light is as tiring as too few')
  return { fixtures: lights.map(l => ({ id: l.id, type: l.type, kind: fixture(l.type).kind, kelvin: fixture(l.type).kelvin, reach_cm: fixture(l.type).reach })),
    layers, zones, average_kelvin: k,
    mood: k === null ? 'unlit' : k <= 2600 ? 'candlelit and cosy' : k <= 3000 ? 'warm, evening-friendly' : k <= 3800 ? 'neutral, works for both' : 'cool and office-like — alert, not relaxing',
    advice }
}
