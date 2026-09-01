import { useRef, useState } from 'react'
import { spec } from './catalog'
import { Glyph } from './glyphs'
import { onTheFloor, hasTwin, roomPasses, TURN, center, doorClearance, footprint, front, minWalk, turningCircles, walkGrid, wallCenter, wallStrip, type Violation } from './rules'
import { beamReach, sun, windowSun } from './sun'
const sunBearing = (h: number, room: Parameters<typeof sun>[1]) => sun(h, room).azimuth
import { acceptProposal, answerNote, humanEvent, push, rejectProposal, removeItem, rotateItem, set, state, updateItem, useStore, type Item, type Room } from './store'

const M = 44, WALL = 14
type Props = { room?: Room; items?: Item[]; mini?: boolean; violations?: Violation[] }

/** what this drawing would tell you if you could see it */
export const describePlan = (room: Room, items: Item[], violations: Violation[], lead = 'Floor plan') => {
  const placed = onTheFloor(items)
  const bad = violations.filter(v => v.severity === 'error')
  return `${lead}. ${room.w} by ${room.h} centimetres, `
    + `${room.doors.length} door${room.doors.length === 1 ? '' : 's'}, ${room.windows.length} window${room.windows.length === 1 ? '' : 's'}. `
    + (placed.length ? `${placed.length} pieces: ${placed.map(i => spec(i.type).label.toLowerCase()).join(', ')}. ` : 'Empty. ')
    + (violations.length ? `${violations.length} problem${violations.length === 1 ? '' : 's'}${bad.length ? `, ${bad.length} to fix` : ''}: ${violations.slice(0, 3).map(v => v.msg).join('. ')}` : 'Every rule passes.')
}

export function Plan(p: Props) {
  const s = useStore()
  const room = p.room ?? s.room, items = p.items ?? s.items, V = p.violations ?? [], mini = !!p.mini
  const svg = useRef<SVGSVGElement>(null)
  const parked = items.filter(i => i.parked)
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; x0: number; y0: number; mark: number } | null>(null)

  const bad = new Map<string, 'error' | 'warn'>()
  for (const v of V) for (const id of v.items) if (bad.get(id) !== 'error') bad.set(id, v.severity)
  const doorBad = new Set(V.filter(v => v.rule === 'door_blocked').map(v => v.ref))
  const showWalk = !mini && (s.profile === 'accessibility' || V.some(v => v.rule === 'walkway'))
  const grid = showWalk ? walkGrid(room, items, minWalk(s.profile)) : null
  const k = Math.min(1, Math.max(0.5, Math.max(room.w, room.h) / 600)) // annotation scale: small rooms zoom in, so shrink text
  const kb = Math.max(0.8, k) // bubbles/controls stay readable

  const toRoom = (e: React.PointerEvent) => { const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse()); return { x: pt.x, y: pt.y } }
  const down = (it: Item) => (e: React.PointerEvent) => {
    if (mini) return
    e.stopPropagation()
    try { (e.target as Element).setPointerCapture?.(e.pointerId) } catch { /* dragging still works; the pointer just is not captured */ }
    const q = toRoom(e); push(); const mark = state.history.length; set({ selected: it.id }); setDrag({ id: it.id, dx: q.x - it.x, dy: q.y - it.y, x0: it.x, y0: it.y, mark })
  }
  const move = (e: React.PointerEvent) => { if (!drag) return; const q = toRoom(e); updateItem(drag.id, { x: q.x - drag.dx, y: q.y - drag.dy }) }
  const up = () => { if (!drag) return; const it = items.find(i => i.id === drag.id); if (!it) return setDrag(null); if (it.x !== drag.x0 || it.y !== drag.y0) humanEvent({ action: 'moved', item: it.id, from: { x: drag.x0, y: drag.y0 }, to: { x: it.x, y: it.y }, text: `dragged the ${spec(it.type).label.toLowerCase()} to (${it.x},${it.y})` })
    else if (state.history.length === drag.mark) set(st => ({ history: st.history.slice(0, -1) })) // a click that moved nothing: drop OUR snapshot only, never the agent's work
    setDrag(null) }

  const doorPath = (d: Room['doors'][number]) => {
    const w = d.width
    switch (d.wall) { // hinge at pos end, leaf swings into the room
      case 'S': return `M${d.pos} ${room.h} v${-w} a${w} ${w} 0 0 1 ${w} ${w}`
      case 'N': return `M${d.pos} 0 v${w} a${w} ${w} 0 0 0 ${w} ${-w}`
      case 'W': return `M0 ${d.pos} h${w} a${w} ${w} 0 0 1 ${-w} ${w}`
      case 'E': return `M${room.w} ${d.pos} h${-w} a${w} ${w} 0 0 0 ${w} ${w}`
    }
  }
  const glare = V.filter(v => v.rule === 'glare').map(v => {
    const sc = items.find(i => i.id === v.items[0])!, w = room.windows.find(x => x.id === v.ref)!
    return { a: wallCenter(room, w.wall, w.pos, w.width), b: center(footprint(sc)), id: v.items[0] + w.id }
  })
  const view = V.filter(v => v.rule === 'viewing_distance').map(v => ({ a: center(footprint(items.find(i => i.id === v.items[0])!)), b: center(footprint(items.find(i => i.id === v.items[1])!)), n: v.msg.match(/(\d+)cm/)?.[1], id: v.items.join() }))

  return (
    <svg ref={svg} viewBox={`${-M * k} ${-M * k} ${room.w + 2.4 * M * k} ${room.h + (2 * M + (parked.length ? 110 : 0)) * k}`} className="w-full h-full select-none touch-none"
      role="img" aria-label={mini ? `Plan of a ${room.w} by ${room.h} centimetre room` : describePlan(room, items, V)}
      onPointerMove={move} onPointerUp={up} onPointerDown={() => !mini && set({ selected: null })}>
      <defs>
        <pattern id="g10" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#22262f" strokeWidth=".6" /></pattern>
        <pattern id="g100" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#g10)" /><path d="M100 0H0V100" fill="none" stroke="#2b303b" strokeWidth="1" /></pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f5b544" /></marker>
      </defs>
      <rect x={0} y={0} width={room.w} height={room.h} fill="var(--color-floor)" />
      <rect x={0} y={0} width={room.w} height={room.h} fill="url(#g100)" />
      {grid && <path d={reachPath(grid)} fill="#4fd68a" opacity={.07} />}
      {/* accessibility: the 150cm circle a wheelchair needs to turn, drawn where the page proved one fits */}
      {!mini && s.profile === 'accessibility' && turningCircles(room, items).map(t => <g key={`turn-${t.item}`}>
        <circle cx={t.x} cy={t.y} r={t.r} fill={t.ok ? '#4fd68a' : '#ff5d5d'} opacity={t.ok ? .05 : .1} className={t.ok ? undefined : 'pulse'} />
        <circle cx={t.x} cy={t.y} r={t.r} fill="none" stroke={t.ok ? '#4fd68a' : '#ff5d5d'} strokeWidth={1.5} strokeDasharray="8 7" opacity={t.ok ? .5 : .85} />
        {/* label sits on the circle's edge, not its centre — the furniture glyph is drawn over the centre */}
        {/* the circle may sit against a wall, and a label centred on it then runs off the drawing —
            "no 1.5m t" was on screen in the beat this whole profile exists for. Monospace, so half the
            width is countable rather than guessed. */}
        {!t.ok && (() => { const half = `no ${TURN / 100}m turn`.length * 3.3 * k
          return <text x={Math.max(half, Math.min(room.w - half, t.x))} y={t.y - t.r + 16 * k} fontSize={11 * k} textAnchor="middle" fill="#ff5d5d" fontFamily="var(--font-mono)">no {TURN / 100}m turn</text> })()}
      </g>)}
      {room.doors.map(d => { const c = doorClearance(room, d, s.profile); return doorBad.has(d.id) && <rect key={d.id} {...c} fill="#ff5d5d" opacity={.22} className="pulse" /> })}
      {room.windows.map(w => { const st = wallStrip(room, w.wall, w.pos, w.width, 40); return <rect key={w.id} {...st} fill="#7fc7ff" opacity={.05} /> })}
      {!mini && (() => { const S = sun(s.hour, room), reach = beamReach(s.hour, room)
        return room.windows.map(w => { const k2 = windowSun(w.wall, s.hour, room); if (k2 < 0.12) return null
          const st = wallStrip(room, w.wall, w.pos, w.width, 0)
          const horiz = w.wall === 'N' || w.wall === 'S'
          const a = horiz ? { x: st.x, y: w.wall === 'N' ? 0 : room.h } : { x: w.wall === 'W' ? 0 : room.w, y: st.y }
          const b = horiz ? { x: st.x + st.w, y: a.y } : { x: a.x, y: st.y + st.h }
          // the patch of floor the beam lands on, cast ALONG the sun direction
          const p = (o: { x: number; y: number }) => `${o.x + S.dir.x * reach},${o.y + S.dir.y * reach}`
          return <polygon key={w.id} points={`${a.x},${a.y} ${b.x},${b.y} ${p(b)} ${p(a)}`} fill={`rgba(245,215,138,${(0.03 + k2 * 0.05).toFixed(3)})`} /> })
      })()}
      {/* walls */}
      <rect x={-WALL / 2} y={-WALL / 2} width={room.w + WALL} height={room.h + WALL} fill="none" stroke={!mini && roomPasses(V, items) ? '#35513f' : 'var(--color-wall)'} strokeWidth={WALL} style={{ transition: 'stroke 600ms' }} />
      {room.windows.map(w => { const st = wallStrip(room, w.wall, w.pos, w.width, 0); const h = w.wall === 'N' || w.wall === 'S'; return <rect key={w.id} x={h ? st.x : st.x - WALL / 2} y={h ? st.y - WALL / 2 : st.y} width={h ? st.w : WALL} height={h ? WALL : st.h} fill="#7fc7ff" opacity={.85} /> })}
      {room.doors.map(d => { const st = wallStrip(room, d.wall, d.pos, d.width, 0); const h = d.wall === 'N' || d.wall === 'S'; return <g key={d.id}>
        <rect x={h ? st.x : st.x - WALL / 2 - 1} y={h ? st.y - WALL / 2 - 1 : st.y} width={h ? st.w : WALL + 2} height={h ? WALL + 2 : st.h} fill="var(--color-bg)" />
        <path d={doorPath(d)} fill="none" stroke={doorBad.has(d.id) ? '#ff5d5d' : '#8b93a7'} strokeWidth={2} strokeDasharray="0" />
      </g> })}
      {room.outlets.map((o, i) => <g key={i} transform={`translate(${o.x} ${o.y})`}><rect x={-6} y={-6} width={12} height={12} rx={2} fill="#14171d" stroke="#f5b544" strokeWidth={1.5} /><path d="M-1 -3 L-2 0 H1 L0 3" stroke="#f5b544" strokeWidth={1.2} fill="none" /></g>)}
      {/* overlays */}
      {glare.map(g => { const v = { x: g.b.x - g.a.x, y: g.b.y - g.a.y }, L = Math.hypot(v.x, v.y) || 1, n = { x: -v.y / L * 45, y: v.x / L * 45 }; return <polygon key={g.id} points={`${g.a.x},${g.a.y} ${g.b.x + n.x},${g.b.y + n.y} ${g.b.x - n.x},${g.b.y - n.y}`} fill="#f5b544" opacity={.18} className="pulse" /> })}
      {view.map(v => <g key={v.id}><line x1={v.a.x} y1={v.a.y} x2={v.b.x} y2={v.b.y} stroke="#f5b544" strokeWidth={1.5} strokeDasharray="6 5" /><text x={(v.a.x + v.b.x) / 2} y={(v.a.y + v.b.y) / 2 - 6} fill="#f5b544" fontSize={12} fontFamily="var(--font-mono)" textAnchor="middle">{v.n}cm</text></g>)}
      {/* items: rugs first */}
      {onTheFloor([...items]).sort((a, b) => (Number(!!spec(a.type).ceiling) - Number(!!spec(b.type).ceiling)) || (Number(!!spec(b.type).passable) - Number(!!spec(a.type).passable))).map(it => {
        const f = footprint(it), c = center(f), b = bad.get(it.id), sel = s.selected === it.id, fr = front(it.rot)
        return <g key={it.id} className={`item ${drag?.id === it.id ? 'dragging' : ''}`} transform={`translate(${c.x} ${c.y})`} onPointerDown={down(it)} opacity={s.spot && !s.spot.ids.includes(it.id) ? 0.22 : 1} style={{ transition: 'opacity 400ms' }}>
          <g className="rot" transform={`rotate(${it.rot})`}><Glyph type={it.type} w={it.w} h={it.h} /></g>
          {s.flash[it.id] && <rect key={s.flash[it.id]} x={-f.w / 2 - 6} y={-f.h / 2 - 6} width={f.w + 12} height={f.h + 12} rx={10} fill="none" stroke="#f5b544" strokeWidth={3} className="flash" />}
          {(b || sel) && <rect x={-f.w / 2 - 3} y={-f.h / 2 - 3} width={f.w + 6} height={f.h + 6} rx={8} fill="none" stroke={b === 'error' ? '#ff5d5d' : b === 'warn' ? '#f5b544' : '#e8eaf0'} strokeWidth={2} className={b ? 'pulse' : ''} />}
          {!mini && (spec(it.type).seat || spec(it.type).screen) && <circle cx={fr.x * (it.rot % 180 ? f.w / 2 : f.h / 2)} cy={fr.y * (it.rot % 180 ? f.w / 2 : f.h / 2)} r={3 * k} fill="#f5b544" opacity={.8} />}
        </g>
      })}
      {/* Every name after every piece. A label drawn inside its own group is covered by whatever comes
          next, so dragging the sofa over the rug hid the rug's name — and in a room where the
          furniture is piled up, that is most of them.
          Ghosts carry their own labels and ✓/✗ chips and land anywhere, including on top of another
          piece's name; while the human is deciding, these are noise, so they step aside. */}
      {!mini && !s.proposals.length && [...items].filter(i => !i.parked && !spec(i.type).ceiling).map(it => {
        const f = footprint(it), c = center(f), sel = s.selected === it.id
        const name = spec(it.type).label.toLowerCase()
        // An id earns its place when it says something the name does not: two of a kind, so you know
        // which one the agent means, or a selected piece the agent calls something else. "sofa · sofa"
        // is not two facts, it is one fact printed twice. Overhead fittings are not named on the floor
        // at all — they hang above it, and their names landed on the furniture underneath.
        const twins = hasTwin(items, it)
        const named = it.id.toLowerCase() !== name.replace(/\s+/g, '')
        const text = (twins || (sel && named) ? `${name} · ${it.id}` : name) + (sel ? ` · ${f.w}×${f.h}` : '')
        // a plate behind it: text crossing text is the difference between a drawing and a mess
        const w = text.length * 5.9 * k, y = f.h / 2 + 14 * k
        return <g key={it.id} transform={`translate(${c.x} ${c.y})`} style={{ pointerEvents: 'none' }}
          opacity={s.spot && !s.spot.ids.includes(it.id) ? 0.22 : 1}>
          <rect x={-w / 2 - 4 * k} y={y - 9 * k} width={w + 8 * k} height={13 * k} rx={3 * k}
            fill="#0d0f13" opacity={sel ? 0.92 : 0.72} />
          <text y={y} fill={sel ? '#e8eaf0' : '#8b93a7'} fontSize={10 * k}
            fontFamily="var(--font-mono)" textAnchor="middle">{text}</text>
        </g>
      })}
      {/* proposals: the agent suggested, the human decides. Ghost at the new spot, arrow from the old one. */}
      {!mini && s.proposals.map(p => { const it = items.find(i => i.id === p.item); if (!it) return null
        const from = center(footprint(it)), g = footprint({ ...it, x: p.x, y: p.y, rot: p.rot }), to = center(g)
        return <g key={p.id} className="pop">
          {!it.parked && <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#f5b544" strokeWidth={1.5} strokeDasharray="5 5" opacity={.7} markerEnd="url(#arrow)" />}
          <g transform={`translate(${to.x} ${to.y})`} opacity={.55}><g transform={`rotate(${p.rot})`}><Glyph type={it.type} w={it.w} h={it.h} /></g></g>
          <rect x={g.x - 3} y={g.y - 3} width={g.w + 6} height={g.h + 6} rx={8} fill="none" stroke="#f5b544" strokeWidth={2} strokeDasharray="7 5" className="pulse" />
          {/* Controls sit INSIDE the ghost's own footprint. Hung underneath, a stacked pair of ghosts put
              one set of chips on top of the next ghost — and the human cannot tell which ✓ moves what. */}
          <g transform={`translate(${to.x} ${to.y - 10 * kb}) scale(${kb})`} style={{ pointerEvents: 'all' }} onPointerDown={e => e.stopPropagation()}>
            {p.why && <><rect x={-p.why.length * 2.6 - 6} y={-11} width={p.why.length * 5.2 + 12} height={14} rx={7} fill="#0d0f13" opacity={.85} /><text y={-1} fontSize={9.5} textAnchor="middle" fill="#e8eaf0" fontFamily="var(--font-sans)">{p.why}</text></>}
            <g {...press(`move the ${spec(it.type).label.toLowerCase()} here, as the agent suggests`, () => acceptProposal(p.id))}><rect x={-44} y={4} width={40} height={16} rx={8} fill="#1f3a2c" stroke="#4fd68a" /><text x={-24} y={15.5} fontSize={9.5} textAnchor="middle" fill="#4fd68a">✓ move</text></g>
            <g {...press(`keep the ${spec(it.type).label.toLowerCase()} where it is`, () => rejectProposal(p.id))}><rect x={4} y={4} width={40} height={16} rx={8} fill="#3a1f1f" stroke="#ff5d5d" /><text x={24} y={15.5} fontSize={9.5} textAnchor="middle" fill="#ff5d5d">✗ keep</text></g>
          </g>
        </g> })}
      {!mini && s.path && <g className="pop"><polyline points={s.path.pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#4fd68a" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={.25} /><polyline points={s.path.pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#4fd68a" strokeWidth={2.5} strokeDasharray="8 8" strokeLinecap="round" strokeLinejoin="round" className="walk" />
        <text x={s.path.pts.at(-1)!.x} y={s.path.pts.at(-1)!.y - 10 * k} fill="#4fd68a" fontSize={11 * k} fontFamily="var(--font-mono)" textAnchor="middle">{(s.path.length / 100).toFixed(1)} m</text></g>}
      {!mini && s.notes.filter(n => n.item || n.x !== undefined).map((n, idx, arr) => {
        const it = n.item ? items.find(i => i.id === n.item) : undefined
        if (n.item && !it) return null
        const collapsed = !!n.answered || idx < arr.length - 3 // answered or old → shrink to a dot
        const f = it ? footprint(it) : undefined, c = f ? center(f) : { x: n.x ?? room.w / 2, y: n.y ?? 0 }
        const top = f ? f.y : (n.y ?? 0), bottom = f ? f.y + f.h : (n.y ?? 0)
        const below = top < 80 // no room above → hang the bubble under the item
        return <g key={n.id} className="item" style={{ pointerEvents: 'none' }} transform={`translate(${c.x} ${below ? bottom : top}) scale(${kb})`}>
          {(!it || collapsed) && <circle r={6} fill={COLOR[n.kind]} stroke="#0d0f13" strokeWidth={2} style={{ pointerEvents: 'all' }}><title>{n.text}{n.answered ? ` — you: ${n.answered}` : ''}</title></circle>}
          {collapsed && n.answered && <text x={9} y={4} fontSize={9} fill="#8b93a7" fontFamily="var(--font-mono)">{n.answered}</text>}
          {!collapsed && <Bubble text={n.text} kind={n.kind} below={below} options={n.options ?? (n.kind === 'warn' ? ['✓ fix it', '✗ leave it'] : n.kind === 'idea' ? ['✓ do it', '✗ no'] : ['👍'])} onPick={o => answerNote(n.id, o)} onReply={() => set({ replyTo: n.id })} clampL={(-c.x + 8) / kb} clampR={(room.w - c.x - 8) / kb} verdict={n.verdict} />}
        </g>
      })}
      {!mini && !drag && (() => { const it = items.find(i => i.id === s.selected); if (!it) return null; const f = footprint(it), c = center(f); const cx = f.x + f.w + 18
        return <g className="item" transform={`translate(${cx} ${c.y}) scale(${kb})`}><g className="pop">
          <g style={{ cursor: 'pointer', pointerEvents: 'all' }} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); push(); rotateItem(it.id) }}>
            <circle cy={-15} r={12} fill="#0d0f13" stroke="#e8eaf0" strokeWidth={1.2} /><text y={-10.5} fontSize={14} textAnchor="middle" fill="#e8eaf0">↻</text><title>rotate (R)</title></g>
          <g style={{ cursor: 'pointer', pointerEvents: 'all' }} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); push(); removeItem(it.id); humanEvent({ action: 'removed', item: it.id, text: `removed the ${spec(it.type).label.toLowerCase()}` }) }}>
            <circle cy={15} r={12} fill="#0d0f13" stroke="#ff5d5d" strokeWidth={1.2} /><text y={19} fontSize={12} textAnchor="middle" fill="#ff5d5d">✕</text><title>remove (⌫)</title></g>
        </g></g> })()}
      {!mini && (() => { const n = -(room.north ?? 0) * Math.PI / 180, r = 16 * k
        return <g transform={`translate(${room.w + 22 * k} ${-20 * k})`} opacity={.85}>
          <circle r={r} fill="none" stroke="#2b303b" strokeWidth={1} />
          <g transform={`rotate(${-(room.north ?? 0)})`}>
            <path d={`M0 ${-r + 2} L${4 * k} ${3 * k} L0 ${1 * k} L${-4 * k} ${3 * k} Z`} fill="#ff5d5d" />
            <text y={-r - 4 * k} fontSize={9 * k} textAnchor="middle" fill="#8b93a7" fontFamily="var(--font-mono)">N</text>
          </g>
          <circle cx={Math.sin(sunBearing(s.hour, room) * Math.PI / 180 + n) * 0} r={0} />
        </g> })()}
      {!mini && parked.length > 0 && (() => { let x = 0
        return <g transform={`translate(0 ${room.h + 46 * k})`} opacity={.55}>
          <text x={0} y={-6 * k} fontSize={10 * k} fill="#8b93a7" fontFamily="var(--font-mono)">set aside — doesn't fit in this room</text>
          {parked.map(it => { const sc = Math.min(1, 90 / Math.max(it.w, it.h)), bw = it.w * sc, bh = it.h * sc, at = x; x += bw + 20
            return <g key={it.id} transform={`translate(${at} 0)`} style={{ cursor: 'pointer' }} onPointerDown={e => { e.stopPropagation(); set({ selected: it.id }) }}>
              <rect x={-6} y={-6} width={bw + 12} height={bh + 12} rx={7} fill="none" stroke={s.selected === it.id ? '#e8eaf0' : '#2b303b'} strokeWidth={1.5} strokeDasharray="5 4" />
              <g transform={`translate(${bw / 2} ${bh / 2}) scale(${sc})`}><Glyph type={it.type} w={it.w} h={it.h} /></g>
              <text x={bw / 2} y={bh + 16 * k} fontSize={9 * k} textAnchor="middle" fill="#8b93a7" fontFamily="var(--font-mono)">{spec(it.type).label.toLowerCase()} · {it.w}×{it.h}</text>
            </g> })}
        </g> })()}
      {!mini && <text x={0} y={room.h + 30 * k} fill="#8b93a7" fontSize={11 * k} fontFamily="var(--font-mono)">{room.w}×{room.h} cm</text>}
    </svg>
  )
}

/** An SVG group that behaves like a button: reachable by tab, announced by name, fired by Enter or
 *  Space. The ✓/✗ on the plan is the human's veto — the most important control on the page — and it
 *  was a shape with an onClick, which no keyboard and no screen reader can find. */
export const press = (label: string, act: () => void) => ({
  role: 'button', tabIndex: 0, 'aria-label': label,
  style: { cursor: 'pointer', pointerEvents: 'all' as const },
  onClick: (e: React.MouseEvent) => { e.stopPropagation(); act() },
  onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); act() } },
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
})

const COLOR = { say: '#e8eaf0', ok: '#4fd68a', warn: '#ff5d5d', idea: '#f5b544' } as const

/** speech bubble; origin = anchor point, bubble sits above (or below) it, tail pointing at the anchor */
function Bubble({ text, kind, below, clampL, clampR, options, onPick, onReply, verdict }: { text: string; kind: keyof typeof COLOR; below: boolean; clampL: number; clampR: number; options: string[]; onPick: (o: string) => void; onReply: () => void; verdict?: { ok: boolean; text: string } }) {
  const vLines = verdict ? wrap((verdict.ok ? '✓ ' : '✗ ') + verdict.text, 44) : []
  const lines = [...wrap(text, 40), ...vLines], lh = 12.5, pad = 7, chips = [...options, 'reply'], chipH = 16
  const chipW = (c: string) => c.length * 5.6 + 12, chipsW = chips.reduce((a, c) => a + chipW(c) + 4, 0) - 4
  const w = Math.max(Math.max(...lines.map(l => l.length)) * 5.5 + 14, chipsW) + pad * 2, h = lines.length * lh + pad * 2 + chipH + 6
  const x = Math.max(clampL, Math.min(clampR - w, -w / 2)), y = below ? 12 : -h - 12, tailY = below ? 12 : -12
  return <g className="pop">
    <path d={`M-6 ${tailY} L0 ${below ? 2 : -2} L6 ${tailY}`} fill="#0d0f13" stroke="#2b303b" strokeWidth={1} />
    <rect x={x} y={y} width={w} height={h} rx={8} fill="#0d0f13" stroke="#2b303b" strokeWidth={1} />
    <rect x={x} y={y + 8} width={3} height={h - 16} rx={1.5} fill={COLOR[kind]} />
    <circle cx={x + 11} cy={y + pad + 5} r={3} fill={COLOR[kind]} opacity={.9} />
    {lines.map((l, i) => <text key={i} x={x + pad + 11} y={y + pad + 9 + i * lh} fill={i >= lines.length - vLines.length ? (verdict!.ok ? '#4fd68a' : '#ff5d5d') : '#e8eaf0'} fontSize={i >= lines.length - vLines.length ? 9.5 : 10.5} fontFamily="var(--font-sans)">{l}</text>)}
    {chips.reduce<{ el: React.ReactNode[]; cx: number }>((acc, c) => {
      const cw = chipW(c), cy = y + h - pad - chipH, isReply = c === 'reply', yes = c.startsWith('✓'), no = c.startsWith('✗')
      acc.el.push(<g key={c} className="chip" {...press(isReply ? 'reply to the agent' : `answer: ${c.replace(/^[✓✗]\s*/, '')}`, () => (isReply ? onReply() : onPick(c)))}>
        <rect x={acc.cx} y={cy} width={cw} height={chipH} rx={8} fill={isReply ? 'transparent' : yes ? '#1f3a2c' : no ? '#3a1f1f' : '#2a2416'} stroke={isReply ? '#2b303b' : yes ? '#4fd68a' : no ? '#ff5d5d' : '#f5b544'} strokeWidth={1} />
        <text x={acc.cx + cw / 2} y={cy + 11.5} fontSize={9.5} textAnchor="middle" fill={isReply ? '#8b93a7' : yes ? '#4fd68a' : no ? '#ff5d5d' : '#f5b544'} fontFamily="var(--font-sans)">{c}</text>
      </g>)
      acc.cx += cw + 4; return acc
    }, { el: [], cx: x + pad }).el}
  </g>
}
function wrap(t: string, n: number) {
  const out: string[] = []; let cur = ''
  for (const w of t.split(' ')) { if ((cur + ' ' + w).trim().length > n) { out.push(cur.trim()); cur = w } else cur += ' ' + w }
  if (cur.trim()) out.push(cur.trim()); return out.slice(0, 4)
}

/** one rect per horizontal run of reachable cells — a 2000cm room was emitting 30k sub-paths per render */
function reachPath(g: ReturnType<typeof walkGrid>) {
  let d = ''
  for (let y = 0; y < g.rows; y++) {
    let run = -1
    for (let x = 0; x <= g.cols; x++) {
      const on = x < g.cols && !!g.reach[y * g.cols + x]
      if (on && run < 0) run = x
      else if (!on && run >= 0) { d += `M${run * 10} ${y * 10}h${(x - run) * 10}v10h-${(x - run) * 10}z`; run = -1 }
    }
  }
  return d
}
