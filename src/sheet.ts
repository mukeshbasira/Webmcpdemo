import { spec } from './catalog'
import { onTheFloor, check, footprint, score } from './rules'
import { imperial } from './space'
import { KIND_PROFILE, WALL, areaM2, flatSize } from './flat'
import { state, stow } from './store'
import type { Item, Room } from './store'

/** A plan you can hand to somebody. The screen version is dark, interactive and full of things only
 *  an agent cares about; paper wants black on white, real dimensions and a schedule you can read in
 *  a shop. ponytail: builds one self-contained HTML document and hands it to the browser's own print
 *  dialogue — no PDF library, no canvas rasterising, and it prints at whatever the paper is. */
const esc = (s: unknown) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
const both = (cm: number) => `${cm}cm / ${imperial(cm)}`

type Prob = { msg: string; severity: string }

// A name written across a rug's edge or a wall line comes out cut in half. Painting the stroke
// first puts a white halo under the letters, which is what a draughtsman's label mask does.
const HALO = 'fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke"'

/** One room: its drawing, its dimensions, its schedule and what is still wrong with it. A home is
 *  several of these, one to a page. */
function roomBlock(title: string, room: Room, items: Item[], violations: Prob[], sub?: string): string {
  const placed = onTheFloor(items)
  const M = 70                                        // margin around the room, in room units
  const vb = `${-M} ${-M} ${room.w + M * 2} ${room.h + M * 2}`
  const fs = Math.max(11, Math.round(room.w / 40))    // label size that survives any room size

  const opening = (o: { wall: string; pos: number; width: number }, stroke: string, w: number) => {
    const N = o.wall === 'N' || o.wall === 'S'
    const x = o.wall === 'W' ? 0 : o.wall === 'E' ? room.w : o.pos
    const y = o.wall === 'N' ? 0 : o.wall === 'S' ? room.h : o.pos
    return `<line x1="${x}" y1="${y}" x2="${N ? x + o.width : x}" y2="${N ? y : y + o.width}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="butt"/>`
  }
  // Things overhead are drawn dashed, the way a floor plan shows what is above head height.
  const box = (it: Item) => {
    const f = footprint(it), up = spec(it.type).ceiling
    return `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="none" stroke="#111" stroke-width="${up ? 1.5 : 2.5}"${up ? ' stroke-dasharray="9 7"' : ''}/>`
  }
  /** Every ref, drawn after every outline. A label under a rectangle drawn later comes out sliced in
   *  half, which is exactly what happened to the ceiling light's ref where the rug crossed it. */
  const tag = (it: Item) => {
    const f = footprint(it)
    // Overhead pieces are in the schedule, so they need a ref on the drawing too, or the schedule
    // sends the reader looking for something that is not there. Tagged small at the corner rather
    // than written across the middle of whatever stands underneath it.
    if (spec(it.type).ceiling)
      return `<text x="${f.x + 2}" y="${Math.max(f.y - fs * .35, fs)}" font-size="${fs * .8}" ${HALO}>${esc(it.id)}</text>`
    // a label wider than its own box goes underneath it instead of spilling over the neighbours
    const wide = it.id.length * fs * 0.58 > f.w - 6
    const y = wide ? f.y + f.h + fs * 1.05 : f.y + f.h / 2 + fs * .35
    // A piece pushed against a wall has its label grow inward, not across the wall line — but the wall
    // is drawn 4 units wide and centred on the boundary, so it covers 2 units of the room, and a label
    // ending at room.w - 2 sits exactly under it. "shelf" came out with its f painted over.
    const half = it.id.length * fs * 0.29
    const mid = f.x + f.w / 2, edge = 5
    const [x, anchor] = mid + half > room.w - edge ? [room.w - edge, 'end']
      : mid - half < edge ? [edge, 'start'] : [mid, 'middle']
    return `<text x="${x}" y="${y}" font-size="${fs}" text-anchor="${anchor}" ${HALO}>${esc(it.id)}</text>`
  }
  // overall dimension lines, the two a builder actually checks
  const dim = `
    <g stroke="#111" stroke-width="1.5" fill="#111" font-size="${fs}">
      <line x1="0" y1="${-M / 2}" x2="${room.w}" y2="${-M / 2}"/>
      <line x1="0" y1="${-M / 2 - 8}" x2="0" y2="${-M / 2 + 8}"/><line x1="${room.w}" y1="${-M / 2 - 8}" x2="${room.w}" y2="${-M / 2 + 8}"/>
      <text x="${room.w / 2}" y="${-M / 2 - 10}" text-anchor="middle">${both(room.w)}</text>
      <line x1="${-M / 2}" y1="0" x2="${-M / 2}" y2="${room.h}"/>
      <line x1="${-M / 2 - 8}" y1="0" x2="${-M / 2 + 8}" y2="0"/><line x1="${-M / 2 - 8}" y1="${room.h}" x2="${-M / 2 + 8}" y2="${room.h}"/>
      <text x="${-M / 2 - 10}" y="${room.h / 2}" text-anchor="middle" transform="rotate(-90 ${-M / 2 - 10} ${room.h / 2})">${both(room.h)}</text>
    </g>`

  const rows = placed.map(i => { const f = footprint(i)
    return `<tr><td>${esc(i.id)}</td><td>${esc(spec(i.type).label)}</td><td>${f.w} × ${f.h}</td><td>${imperial(f.w)} × ${imperial(f.h)}</td><td>${f.x}, ${f.y}</td></tr>` }).join('')
  const aside = items.filter(i => i.parked)
  const probs = violations.length
    ? `<h2>Open problems</h2><ul>${violations.map(v => `<li${v.severity === 'error' ? ' class="err"' : ''}>${esc(v.msg)}</li>`).join('')}</ul>`
    : `<h2>Open problems</h2><p class="ok">None — every rule in force passes.</p>`

  return `<section class="room">
  <h1>${esc(title)}</h1>
  <div class="meta">${sub ? esc(sub) + ' · ' : ''}${both(room.w)} × ${both(room.h)} · ${(room.w * room.h / 10000).toFixed(1)} m² ·
    ${placed.length} piece${placed.length === 1 ? '' : 's'} · scores ${score(violations as never)}/100</div>
  <svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${room.w}" height="${room.h}" fill="none" stroke="#111" stroke-width="4"/>
    ${room.windows.map(w => opening(w, '#111', 9)).join('')}
    ${room.doors.map(d => opening(d, '#fff', 9)).join('')}
    ${room.doors.map(d => opening(d, '#111', 9).replace('stroke-width="9"', 'stroke-width="2" stroke-dasharray="10 7"')).join('')}
    ${room.outlets.map(o => `<circle cx="${o.x}" cy="${o.y}" r="7" fill="#111"/>`).join('')}
    ${placed.filter(i => spec(i.type).ceiling).map(box).join('')}
    ${placed.filter(i => !spec(i.type).ceiling).map(box).join('')}
    ${placed.map(tag).join('')}
    ${dim}
  </svg>
  ${placed.length ? `<h2>Schedule</h2>
  <table><thead><tr><th>Ref</th><th>Piece</th><th>Footprint (cm)</th><th>Imperial</th><th>x, y (cm)</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="meta">Nothing in this room yet.</p>'}
  ${aside.length ? `<p class="meta" style="margin-top:8px">Set aside, not in the room: ${aside.map(i => esc(i.id)).join(', ')}</p>` : ''}
  ${probs}
  </section>`
}

const SHELL_CSS = `
  @page { margin: 14mm }
  body { font: 12px/1.5 -apple-system, system-ui, sans-serif; color:#111; background:#fff; margin:0 }
  h1 { font-size:21px; margin:0 0 2px } h2 { font-size:13px; margin:18px 0 6px; text-transform:uppercase; letter-spacing:.08em }
  .meta { color:#555; font-size:12px }
  svg { width:100%; height:auto; max-height:132mm; margin:12px 0 }
  table { border-collapse:collapse; width:100%; font-size:11.5px }
  th { text-align:left; border-bottom:1.5px solid #111; padding:4px 6px 4px 0; font-weight:600 }
  td { border-bottom:1px solid #ddd; padding:4px 6px 4px 0 }
  ul { margin:0; padding-left:18px } li { margin:2px 0 } .err { font-weight:600 }
  .ok { color:#0a7a3d } footer { margin-top:22px; color:#777; font-size:10.5px; border-top:1px solid #ddd; padding-top:7px }
  .hint { background:#f4f4f4; border:1px solid #ddd; padding:8px 10px; border-radius:6px; margin-bottom:14px; font-size:12px }
  .room + .room { break-before: page; page-break-before: always; padding-top: 6px }
  @media print { .hint { display:none } }`

const FOOT = `<footer>Dashed outlines are fixed overhead — lights and blinds — and are listed in the schedule.
  Dimensions are the footprint each piece occupies, from the top-left corner of its own room; x runs east, y runs south.
  Catalogue sizes are typical, not measured — check anything you are about to buy.
  Drawn ${new Date().toLocaleDateString()} by ROOM.</footer>`

const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} — plan</title><style>${SHELL_CSS}</style></head><body>
  <div class="hint">Press ⌘P / Ctrl-P to print or save this as a PDF.</div>${body}${FOOT}</body></html>`

/** A plan somebody can hold. One room when that is all there is; a whole home, a room to a page, when
 *  the human is planning one — printing only the room you happen to be standing in is the wrong
 *  artefact to hand a carpenter who is doing the whole flat. */
export function planSheet(title: string, violations: Prob[]): string {
  const f = state.flat
  if (!f) return page(title, roomBlock(title, state.room, state.items, violations))

  stow()                                              // whatever is on screen belongs to its room first
  const rooms = state.flat!.rooms
  const each = rooms.map(r => {
    const v = check(r.room, r.items, KIND_PROFILE[r.kind], undefined, state.hour, null)
    const sub = r.kind === 'bedroom' && r.people ? `sleeps ${r.people}` : KIND_PROFILE[r.kind] === 'accessibility' ? 'judged as accessible' : undefined
    return { r, v, html: roomBlock(r.name, r.room, r.items, v, sub) }
  })
  const done = each.filter(e => onTheFloor(e.r.items).length)
  // The cover carries the drawing of the whole home, because a table of rooms is a list and a plan is
  // a plan. Same geometry as the screen, in ink.
  const size = flatSize(f)
  const B = WALL * 3
  const overview = `<svg viewBox="${-B} ${-B} ${size.w + B * 2} ${size.h + B * 2}" xmlns="http://www.w3.org/2000/svg" style="max-height:112mm">
    ${rooms.map(r => `<rect x="${r.x - WALL}" y="${r.y - WALL}" width="${r.room.w + WALL * 2}" height="${r.room.h + WALL * 2}" fill="#111"/>`).join('')}
    ${rooms.map(r => `<rect x="${r.x}" y="${r.y}" width="${r.room.w}" height="${r.room.h}" fill="#fff"/>`).join('')}
    ${rooms.map(r => r.room.doors.map(d => { const N = d.wall === 'N' || d.wall === 'S'
      const x = r.x + (d.wall === 'W' ? 0 : d.wall === 'E' ? r.room.w : d.pos)
      const y = r.y + (d.wall === 'N' ? 0 : d.wall === 'S' ? r.room.h : d.pos)
      return `<line x1="${x}" y1="${y}" x2="${N ? x + d.width : x}" y2="${N ? y : y + d.width}" stroke="#fff" stroke-width="${WALL + 4}"/>` }).join('')).join('')}
    ${rooms.map(r => r.room.windows.map(win => { const N = win.wall === 'N' || win.wall === 'S'
      const x = r.x + (win.wall === 'W' ? 0 : win.wall === 'E' ? r.room.w : win.pos)
      const y = r.y + (win.wall === 'N' ? 0 : win.wall === 'S' ? r.room.h : win.pos)
      return `<line x1="${x}" y1="${y}" x2="${N ? x + win.width : x}" y2="${N ? y : y + win.width}" stroke="#111" stroke-width="5"/>` }).join('')).join('')}
    ${rooms.map(r => r.items.filter(i => !i.parked && !spec(i.type).ceiling).map(i => { const fp = footprint(i)
      return `<rect x="${r.x + fp.x}" y="${r.y + fp.y}" width="${fp.w}" height="${fp.h}" fill="none" stroke="#111" stroke-width="2"/>` }).join('')).join('')}
    ${rooms.map(r => { const t = r.name.toUpperCase()
      return `<rect x="${r.x + 8}" y="${r.y + 10}" width="${t.length * 13 + 14}" height="26" fill="#fff"/>`
        + `<text x="${r.x + 15}" y="${r.y + 30}" font-size="22" fill="#111" font-family="sans-serif">${esc(t)}</text>` }).join('')}
  </svg>`

  const contents = `<section class="room">
    <h1>${esc(f.name)}</h1>
    <div class="meta">${areaM2(f)} m² over ${rooms.length} rooms · ${f.people} living here${done.length ? ` · ${Math.round(done.reduce((t, e) => t + score(e.v as never), 0) / done.length)}/100 across the furnished rooms` : ''}</div>
    ${overview}
    <h2>Rooms</h2>
    <table><thead><tr><th>Room</th><th>Size (cm)</th><th>Imperial</th><th>m²</th><th>Pieces</th><th>Score</th></tr></thead><tbody>
    ${each.map(({ r, v }) => { const n = onTheFloor(r.items).length
      return `<tr><td>${esc(r.name)}</td><td>${r.room.w} × ${r.room.h}</td><td>${imperial(r.room.w)} × ${imperial(r.room.h)}</td><td>${(r.room.w * r.room.h / 10000).toFixed(1)}</td><td>${n || '—'}</td><td>${n ? score(v as never) + '/100' : 'empty'}</td></tr>` }).join('')}
    </tbody></table>
    <p class="meta" style="margin-top:8px">Each room is drawn on its own page overleaf.</p>
  </section>`
  return page(f.name, contents + each.map(e => e.html).join(''))
}


/** open it in its own window so the app keeps its state and the browser owns the printing */
export function openSheet(title: string, violations: { msg: string; severity: string }[]): boolean {
  if (typeof window === 'undefined') return false
  // a blob: URL rather than document.write, so the tab has a real address the human can reload,
  // bookmark or print twice, and the browser treats it as a document instead of a scribbled-on blank
  const url = URL.createObjectURL(new Blob([planSheet(title, violations)], { type: 'text/html' }))
  const w = window.open(url, '_blank')
  if (!w) { URL.revokeObjectURL(url); return false }   // popup blocked — the caller says so out loud
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return true
}
