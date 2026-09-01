import { WALL, flatSize, type Flat, type FlatRoom } from './flat'
import { Glyph } from './glyphs'
import { KIND_PROFILE } from './flat'
import { press } from './Plan'
import { onTheFloor, check, footprint, score } from './rules'
import { enterRoom, humanEvent, useStore } from './store'

/** The whole home on one drawing, with the walls between the rooms. Each room is still judged on its
 *  own — this is the view, not the model. Click a room to stand in it.
 *  ponytail: walls are drawn as the gaps between the room rectangles rather than modelled as objects.
 *  Nothing needs to collide with them, so they cost one rect and no geometry. */
export function FlatPlan({ sample }: { sample?: Flat } = {}) {
  const s = useStore()
  const f = sample ?? s.flat
  if (!f) return null
  const live = !sample
  const { w, h } = flatSize(f)
  const P = WALL * 2                                  // breathing room around the whole drawing
  const vb = `${-P} ${-P} ${w + P * 2} ${h + P * 2}`

  const doorMark = (r: FlatRoom, d: { wall: string; pos: number; width: number }) => {
    const N = d.wall === 'N' || d.wall === 'S'
    const x = r.x + (d.wall === 'W' ? 0 : d.wall === 'E' ? r.room.w : d.pos)
    const y = r.y + (d.wall === 'N' ? 0 : d.wall === 'S' ? r.room.h : d.pos)
    return <line key={`${r.id}${d.wall}${d.pos}`} x1={x} y1={y} x2={N ? x + d.width : x} y2={N ? y : y + d.width}
      stroke="#0d0f13" strokeWidth={WALL + 3} strokeLinecap="butt" />
  }

  // At thumbnail size the room names shrink to a few pixels, so the sample draws them larger and drops
  // the per-room score line — a preview has to read at a glance or it is just texture.
  const nameSize = live ? 18 : 42
  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" className="w-full h-full flex-1 min-h-0 block">
        {/* The wall mass, drawn as the union of each room's own envelope rather than one bounding box.
            A bounding box invents empty space wherever a column is shorter than its neighbour — the
            flat looked like it had a phantom room below the hall. Real flats are rarely rectangles. */}
        {f.rooms.map(r => <rect key={`w-${r.id}`} x={r.x - WALL} y={r.y - WALL} width={r.room.w + WALL * 2} height={r.room.h + WALL * 2} fill="#4a5163" />)}
        {f.rooms.map(r => <rect key={`f-${r.id}`} x={r.x} y={r.y} width={r.room.w} height={r.room.h} fill="#12151b" />)}
        {f.rooms.map(r => {
          const v = check(r.room, r.items, KIND_PROFILE[r.kind], undefined, s.hour, null)
          const placed = onTheFloor(r.items)
          const active = r.id === s.here
          return (
            <g key={r.id} {...(live
              ? press(`work in the ${r.name.toLowerCase()} — ${placed.length} piece${placed.length === 1 ? '' : 's'}`,
                  () => { enterRoom(r.id); humanEvent({ action: 'room', to: r.id, text: `walked into the ${r.name.toLowerCase()}` }) })
              : { style: { cursor: 'default' as const } })}>
              <rect x={r.x} y={r.y} width={r.room.w} height={r.room.h} fill={active ? '#171c26' : 'transparent'}
                stroke={active ? '#f5b544' : '#2b303b'} strokeWidth={active ? 5 : 2} />
              {r.room.windows.map(win => { const N = win.wall === 'N' || win.wall === 'S'
                const x = r.x + (win.wall === 'W' ? 0 : win.wall === 'E' ? r.room.w : win.pos)
                const y = r.y + (win.wall === 'N' ? 0 : win.wall === 'S' ? r.room.h : win.pos)
                return <line key={win.id} x1={x} y1={y} x2={N ? x + win.width : x} y2={N ? y : y + win.width} stroke="#5b9bd5" strokeWidth={7} /> })}
              {r.room.doors.map(d => doorMark(r, d))}
              {placed.map(i => { const fp = footprint(i)
                return <g key={i.id} transform={`translate(${r.x + fp.x + fp.w / 2} ${r.y + fp.y + fp.h / 2}) rotate(${i.rot})`} opacity={.85}>
                  <Glyph type={i.type} w={i.w} h={i.h} />
                </g> })}
              {/* Labels sit on a plate in the corners. Centred, they landed on top of the very furniture
                  the room is there to hold — the bed had the bedroom's name written across it. */}
              {(() => { const t = r.name.toUpperCase(), wd = t.length * nameSize * .62 + 16
                return <g>
                  <rect x={r.x + 8} y={r.y + 8} width={wd} height={nameSize * 1.45} rx={4} fill="#0d0f13" opacity={.82} />
                  <text x={r.x + 16} y={r.y + nameSize * 1.15} fontSize={nameSize} fill={active ? '#f5b544' : '#9aa3b8'} fontFamily="var(--font-mono)">{t}</text>
                </g> })()}
              {live && (() => { const t = `${(r.room.w * r.room.h / 10000).toFixed(1)}m² · ${placed.length ? `${score(v)}/100` : 'empty'}`, wd = t.length * 8.4 + 14
                return <g>
                  <rect x={r.x + r.room.w - wd - 8} y={r.y + r.room.h - 32} width={wd} height={24} rx={4} fill="#0d0f13" opacity={.82} />
                  <text x={r.x + r.room.w - 15} y={r.y + r.room.h - 15} textAnchor="end" fontSize={14} fill="#7b8496" fontFamily="var(--font-mono)">{t}</text>
                </g> })()}
            </g>
          )
        })}
      </svg>
      {live && <div className="shrink-0 pt-2 text-[11px] text-mute font-mono">
        {f.name} · {flatSize(f).w}×{flatSize(f).h}cm overall — click a room to work in it
      </div>}
    </div>
  )
}
