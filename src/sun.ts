import type { Pt, Room, Wall } from './store'

/** Where the sun is, as a direction in room coordinates.
 *  azimuth: compass bearing the sun is IN (0=N, 90=E, 180=S, 270=W)
 *  altitude: degrees above the horizon (<=0 means below it)
 *  The room can be rotated: `north` is the compass bearing of the room's -y (north) wall. */
export type Sun = { azimuth: number; altitude: number; up: boolean; dir: Pt; kelvin: number; label: string }

const RAD = Math.PI / 180

/** Simple solar path: sunrise 6:00 due east, noon 12:00 due south, sunset 18:00 due west.
 *  `season` shifts day length and noon height (summer = longer, higher). Northern hemisphere. */
export function sunAt(hour: number, season: 'summer' | 'spring' | 'winter' = 'spring'): Omit<Sun, 'dir' | 'label'> {
  const half = season === 'summer' ? 8 : season === 'winter' ? 4.5 : 6.2   // hours from noon to sunset
  const peak = season === 'summer' ? 62 : season === 'winter' ? 20 : 42     // noon altitude in degrees
  const t = (hour - 12) / half                                             // -1 at sunrise, 0 at noon, +1 at sunset
  const altitude = Math.round(peak * Math.cos(Math.min(1, Math.abs(t)) * (Math.PI / 2)) * 10) / 10
  const azimuth = Math.round((180 + t * 105 + 360) % 360)                  // E through S to W
  return { azimuth, altitude, up: altitude > 1, kelvin: altitude > 25 ? 5200 : altitude > 8 ? 3600 : 2400 }
}

export const sun = (hour: number, room: Room): Sun => {
  const s = sunAt(hour, room.season ?? 'spring')
  const bearing = (s.azimuth - (room.north ?? 0) + 360) % 360               // sun's bearing in ROOM coords
  // room axes: -y is the room's north wall, +x is east
  const dir = { x: -Math.sin(bearing * RAD), y: Math.cos(bearing * RAD) }   // unit vector the light TRAVELS along
  const label = !s.up ? 'below the horizon' : `${Math.round(s.altitude)}° up, bearing ${Math.round(bearing)}° (${compass(bearing)})`
  return { ...s, azimuth: bearing, dir, label }
}

export const compass = (b: number) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((b % 360) + 360) % 360 / 45) % 8]

const WALL_NORMAL: Record<Wall, Pt> = { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } }

/** does direct sun reach through a window on this wall, and how square-on? 0 = none, 1 = straight in */
export function windowSun(wall: Wall, hour: number, room: Room): number {
  const s = sun(hour, room)
  if (!s.up) return 0
  const n = WALL_NORMAL[wall]
  const facing = -(s.dir.x * n.x + s.dir.y * n.y)     // light travelling INTO the room through this wall
  if (facing <= 0.08) return 0
  const low = Math.max(0, Math.min(1, s.altitude / 45)) // a high sun spills less far into the room
  return Math.round(facing * (0.35 + 0.65 * (1 - low)) * 100) / 100
}

/** how far into the room the beam reaches (cm) — a low sun throws long light */
export const beamReach = (hour: number, room: Room) => {
  const s = sun(hour, room)
  if (!s.up) return 0
  return Math.round(Math.min(500, 110 / Math.tan(Math.max(8, s.altitude) * RAD)))
}
