import { spec } from './catalog'
import { center, dist, footprint, front, gap } from './rules'
import { state, type Claim, type Verdict } from './store'

const TOL = { distance: 0.12, gap: 0.15, angle: 0.15, clear: 0.15 } // fractional tolerance

/** check a measurable claim the agent made against the page's own geometry */
export function verify(c: Claim): Verdict | { error: string } {
  // Be liberal about how the number arrives — `cm` is what an agent naturally writes for a gap — but
  // never let a missing one through: an unchecked value printed "is 115cm, not NaNcm" at the human,
  // in the one place on the page whose whole job is to be trustworthy about numbers.
  const raw = typeof c.value === 'number' ? c.value : (c as unknown as { cm?: unknown }).cm
  if (typeof raw !== 'number' || !isFinite(raw)) return { error: 'a claim needs a numeric `value` — the number you said out loud' }
  c = { ...c, value: raw }
  const A = state.items.find(i => i.id === c.a), B = c.b ? state.items.find(i => i.id === c.b) : undefined
  if (!A) return { error: `unknown item ${c.a}` }
  if ((c.kind === 'distance' || c.kind === 'gap' || c.kind === 'angle') && !B) return { error: `${c.kind} needs two items (a and b)` }
  const fa = footprint(A), fb = B ? footprint(B) : undefined
  let actual: number, unit = c.unit ?? 'cm'
  switch (c.kind) {
    case 'distance': actual = Math.round(dist(center(fa), center(fb!))); break
    case 'gap': actual = Math.round(gap(fa, fb!)); break
    case 'clear': actual = Math.round(Math.min(fa.x, fa.y, state.room.w - fa.x - fa.w, state.room.h - fa.y - fa.h)); break
    case 'angle': {
      const f = front(A.rot), v = { x: center(fb!).x - center(fa).x, y: center(fb!).y - center(fa).y }, d = Math.hypot(v.x, v.y) || 1
      actual = Math.round(Math.acos(Math.max(-1, Math.min(1, (v.x * f.x + v.y * f.y) / d))) * 180 / Math.PI); unit = '°'
      break
    }
  }
  // normalise to the unit the page measures in (cm, or degrees)
  let said = c.value
  if (unit !== '°') {
    const u = (c.unit ?? 'cm').toLowerCase()
    if (u === 'm' || u === 'metres' || u === 'meters') said = said * 100
    else if (u === 'mm') said = said / 10
    // "2.8" with no unit is obviously metres — but 10 is not. A bare number under 12 used to be
    // multiplied by a hundred whatever it was, so an agent that correctly said the sofa has 10cm to
    // the wall was told it was wrong about its own room. Only a fraction gives it away: the page
    // measures in whole centimetres, so 2.4 cannot be one and a value below 1 cannot be either.
    // A round "3" meaning three metres reads as 3cm and fails loudly with the real number beside it,
    // which is the safe way round — this tool exists to catch a wrong number, not to find a reading
    // that lets one through.
    else if (said > 0 && said < 12 && !Number.isInteger(said)) said = said * 100
    said = Math.round(said)
    unit = 'cm'
  }
  const ok = Math.abs(actual - said) <= Math.max(unit === '°' ? 6 : 15, said * TOL[c.kind])
  const label = { distance: 'centre-to-centre distance', gap: 'clear gap', clear: 'space to the nearest wall', angle: 'angle off centre' }[c.kind]
  const names = B ? `between ${spec(A.type).label} and ${spec(B.type).label}` : `for the ${spec(A.type).label.toLowerCase()}`
  const said_ = `the ${label} ${names} is ${actual}${unit}`
  return { ok, actual, said, text: ok ? `checked: ${said_}` : `not quite — ${said_}, not ${said}${unit}` }
}
