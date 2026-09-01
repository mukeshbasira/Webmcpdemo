import { useEffect, useRef, useState } from 'react'
import { CATALOG_TYPES, spec } from './catalog'
import { PRESETS } from './presets'
import { onTheFloor, PROFILE_RULES, RULE_LABEL, score, type Violation } from './rules'
import { GET_WEBMCP, PROFILES, ROOM_MAX, ROOM_MIN, SEASONS, addItem, atWholeHome, enterRoom, flash, forget, getItem, humanEvent, leaveRoom, pop, push, removeItem, resizeRoom, set, state, updateItem, useStore, whoPhrase, type Season } from './store'
import { loadPreset } from './tools'
import { autoLayout, findSpace, imperial, type Prefer } from './space'
import { compass, sun as solar } from './sun'
import { demoFor, runDemo, stopDemo } from './demo'
import { openSheet } from './sheet'
import { KIND_NOTE, areaM2 } from './flat'

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <label className="flex items-center gap-1">
    <span className="sr-only">{label}</span>
    {/* the field used to allow 20 to 2000 while the room itself is 150 to 1000, so typing 2000 showed
        a number the page then quietly reduced. One pair of bounds, and the browser enforces them too. */}
    <input type="number" step={10} min={ROOM_MIN} max={ROOM_MAX} value={value}
      onChange={e => { const v = +e.target.value; if (v >= ROOM_MIN && v <= ROOM_MAX) onChange(v) }}
      className="w-[68px] bg-bg border border-line rounded px-2 py-1 font-mono text-[12px] outline-none focus:border-accent" />
  </label>
}

const DEV = new URLSearchParams(location.search).has('dev') // ponytail: automation buttons are agent tools; humans only see them in dev

export function Panel({ V }: { V: Violation[] }) {
  const s = useStore()
  const p = PRESETS.find(x => x.id === s.presetId)
  const [copied, setCopied] = useState(false)
  const sc = score(V)
  const sel = s.items.find(i => i.id === s.selected)
  const steps = demoFor(s.presetId)
  const here = s.flat?.rooms.find(r => r.id === s.here) ?? null
  const byRule = new Map<string, Violation[]>()
  for (const v of V) byRule.set(v.rule, [...(byRule.get(v.rule) ?? []), v])

  // A bare "›" is a shape, not a word: people did not know it was a control, and the ones who pressed
  // it did not know how to get back. Both states say what they do, and the collapsed strip keeps the
  // red dot so a room with problems in it never goes quiet just because the panel is shut.
  if (s.panelHidden) return (
    <button onClick={() => set({ panelHidden: false })} title="show the panel" aria-label="show the panel" aria-expanded={false}
      className="shrink-0 h-full w-9 bg-panel border-l border-line text-mute hover:text-ink hover:bg-line/30 flex flex-col items-center justify-center gap-2">
      <span className="text-[15px]">‹</span>
      <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] uppercase tracking-wider">show panel</span>
      {V.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red" title={`${V.length} open problem${V.length === 1 ? '' : 's'}`} />}
    </button>
  )

  return (
    <aside className="w-[340px] shrink-0 h-full overflow-y-auto bg-panel border-l border-line flex flex-col text-[13px]">
      {s.flat && <section className="p-5 border-b border-line">
        <div className="flex items-baseline justify-between">
          <div className="text-[11px] uppercase tracking-wider text-mute">{s.flat.name}</div>
          <div className="text-[11px] text-mute">{areaM2(s.flat)}m²</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button onClick={() => leaveRoom()}
            className={`px-2.5 py-1 rounded-md border text-[12px] ${!s.here ? 'bg-accent text-bg border-accent' : 'border-line text-mute hover:text-ink'}`}>Whole home</button>
          {s.flat.rooms.map(r => <button key={r.id} onClick={() => { enterRoom(r.id); humanEvent({ action: 'room', to: r.id, text: `walked into the ${r.name.toLowerCase()}` }) }}
            title={KIND_NOTE[r.kind]}
            className={`px-2.5 py-1 rounded-md border text-[12px] ${s.here === r.id ? 'bg-accent text-bg border-accent' : 'border-line text-mute hover:text-ink'}`}>
            {r.name}{r.kind === 'bedroom' && r.people > 0 ? <span className="opacity-60"> ·{r.people}</span> : null}
          </button>)}
        </div>
        <p className="text-[11px] text-mute mt-2">{here ? KIND_NOTE[here.kind] : 'the whole flat, walls and all — click a room to work in it'} — <span className="text-accent">the agent's tools change with the room too</span>.</p>
      </section>}

      <section className="p-5 border-b border-line">
        <div className="flex items-baseline justify-between">
          <h1 className="font-serif text-2xl">{here?.name ?? (s.flat ? s.flat.name : p?.title ?? 'Custom room')}</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => set({ panelHidden: true })} title="hide this panel" aria-label="hide this panel" aria-expanded={true}
              className="px-2 py-1 rounded-md border border-line text-mute hover:text-ink hover:border-mute text-[11px] uppercase tracking-wider leading-none flex items-center gap-1.5">hide<span className="text-[13px] leading-none">›</span></button>
          </div>
        </div>
        {atWholeHome(s)
          ? <div className="mt-2 text-[12px] text-accent">{s.flat.rooms.filter(r => onTheFloor(r.items).length > 0).length} of {s.flat.rooms.length} rooms furnished · {s.flat.people} living here</div>
          : s.brief && <div className="mt-2 text-[12px] text-accent">for {whoPhrase(s.brief)} to {s.brief.activity}</div>}
        <p className="text-mute mt-1">{p?.tagline}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
          {!atWholeHome(s) && <button onClick={() => { loadPreset(s.presetId!); humanEvent({ action: 'reset', detail: s.presetId ?? undefined, text: 'reset the scene — every item is back to its starting place and ids are unchanged' }) }} disabled={!p} className="px-3 py-1.5 rounded-md border border-line hover:border-mute disabled:opacity-40">Reset</button>}
          {!atWholeHome(s) && <button onClick={() => { pop(); humanEvent({ action: 'undo', text: 'undid the last change' }) }} disabled={!s.history.length} className="px-3 py-1.5 rounded-md border border-line hover:border-mute disabled:opacity-40">Undo</button>}
          {DEV && <button onClick={() => { autoLayout(); humanEvent({ action: 'auto_arrange', text: 'pressed Auto-arrange' }) }} disabled={!s.items.length} className="px-3 py-1.5 rounded-md border border-accent/60 text-accent hover:bg-accent hover:text-bg disabled:opacity-40" title="dev only: the page's greedy baseline">Baseline</button>}
          {(s.items.length > 0 || s.flat?.rooms.some(r => onTheFloor(r.items).length > 0)) && <button onClick={() => { if (!openSheet(p?.title ?? s.flat?.name ?? 'Room plan', V)) alert('Your browser blocked the new tab — allow pop-ups for this page.'); humanEvent({ action: 'print', text: 'opened the printable plan' }) }} className="px-3 py-1.5 rounded-md border border-line hover:border-mute" title="a dimensioned plan you can print or save as a PDF">Print plan</button>}
          {s.selected && <button onClick={() => { const id = s.selected!; push(); removeItem(id); humanEvent({ action: 'removed', item: id, text: `removed ${id}` }) }} className="px-3 py-1.5 rounded-md border border-line hover:border-red text-red">Remove {s.selected}</button>}
        </div>
      </section>

      <section className="p-5 border-b border-line">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wider text-mute">Your agent</div>
          <div className="flex items-center gap-1.5 text-[11px] text-mute"><span className={`w-2 h-2 rounded-full ${s.calls.length ? 'bg-green' : s.mcp === 'ok' ? 'bg-accent' : s.mcp === 'missing' ? 'bg-red' : 'bg-mute'}`} />{s.calls.length ? 'agent active' : s.mcp === 'ok' ? 'tools registered (WebMCP)' : s.mcp === 'missing' ? 'no WebMCP in this browser' : '…'}</div>
        </div>
        {s.nudge && <div className="mb-3 rise rounded-lg border border-accent/60 bg-accent/10 p-3 text-[12px]">
          <div className="text-[11px] uppercase tracking-wider text-accent mb-1">The page is calling your agent</div>
          <div>{s.nudge.text}</div>
          <div className="text-mute text-[11px] mt-1">Registered as a tool named <span className="font-mono">read_message_from_human</span> — the browser fired <span className="font-mono">toolchange</span>. When your agent reads it, this disappears.</div>
        </div>}
        <ToolList names={s.mcpTools} />
        {s.storage !== 'ok' && <div className="mb-3 rounded-lg border border-red/50 bg-red/10 p-3 text-[12px]">
          <div className="text-red">{s.storage === 'blocked' ? 'This browser will not let the page store anything' : 'This browser has run out of room to store anything'}</div>
          <div className="text-mute mt-1">Nothing you do here is being kept — private mode, or the site data is full. Use <span className="font-mono">share()</span> to put the whole plan in a link instead; it stores nothing.</div>
        </div>}
        {s.learned.length > 0 && <div className="mb-3 rounded-lg bg-bg border border-line p-3">
          <div className="flex items-center justify-between"><span className="text-[11px] uppercase tracking-wider text-mute">This room remembers</span><button onClick={forget} className="text-[11px] text-mute hover:text-ink">forget</button></div>
          <ul className="mt-1.5 space-y-1 text-[11px] text-mute">{s.learned.slice(-4).reverse().map(l => <li key={l.t}>· {l.text}</li>)}</ul>
          <p className="text-[11px] text-mute mt-1.5">Every agent that opens this room reads these first. Stored in your browser only.</p>
        </div>}
        {p && <div className="mb-3 rounded-lg bg-bg border border-line p-3">
          <div className="text-[11px] uppercase tracking-wider text-mute mb-1">Try saying</div>
          <div className="font-serif text-[15px] leading-snug">“{p.prompt}”</div>
          <button onClick={async () => { try { await navigator.clipboard.writeText(p.prompt); setCopied(true) } catch { setCopied(false); alert(`Copy this and say it to your agent:\n\n${p.prompt}`) } setTimeout(() => setCopied(false), 1200) }} className="mt-2 text-accent hover:underline">{copied ? 'copied' : 'copy'}</button>
        </div>}
        {/* no agent attached? play the same calls a real one makes, so the page can still make its case */}
        {steps && (s.demo === null
          ? <button onClick={runDemo} className="w-full mb-3 px-3 py-2.5 rounded-lg border border-accent/60 text-accent hover:bg-accent hover:text-bg text-[12px]">
              ▶ Watch a session · {steps.length} real tool calls, no agent needed
            </button>
          : <div className="mb-3 rounded-lg border border-accent/60 bg-accent/10 p-3">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-accent">
                <span>Scripted session · {s.demo + 1}/{steps.length}</span>
                <button onClick={stopDemo} className="text-mute hover:text-ink normal-case tracking-normal">stop</button>
              </div>
              <div className="mt-1.5 text-[12px]">{steps[s.demo][2]}</div>
              <div className="mt-2 h-0.5 bg-line rounded"><div className="h-full bg-accent rounded transition-all" style={{ width: `${((s.demo + 1) / steps.length) * 100}%` }} /></div>
            </div>)}
        <p className="text-[12px] text-mute mb-2">{s.mcp === 'ok' ? 'This page exposes its tools to the agent in your browser (ChatGPT app or Chrome with WebMCP). It can lay out the room, explain choices in bubbles, and ask you questions here.' : `Everything works on its own. To plan together with an agent, open this page in ${GET_WEBMCP}.`}</p>
        {/* discoverable by page-reading agents (e.g. browser extensions without WebMCP): same tools, same transcript */}
        <p className="sr-only" data-agent-hint>Agents without WebMCP: this page's tools are also callable from JavaScript as window.room.&lt;tool&gt;(args) and return the same JSON, e.g. await window.room.get_room(), await window.room.find_space({'{'}type:'sofa'{'}'}), await window.room.move_items({'{'}items:[{'{'}id:'sofa',x:200,y:300{'}'}]{'}'}), await window.room.say({'{'}item:'sofa', text:'…'{'}'}). Tool list: await window.room.list_tools().</p>
        {s.humanEvents.length > 0 && <div className="mb-3 text-[11px] text-accent">{s.humanEvents.length} update{s.humanEvents.length > 1 ? 's' : ''} queued for your agent — it reads them the next time it acts</div>}
        <ul className="space-y-1.5 text-[12px]" aria-live="polite" aria-label="What the agent and you have done">
          {[...s.feed].reverse().slice(0, 14).map((f, i) => <li key={`${f.t}-${i}`} className="rise flex gap-2"><span className={`shrink-0 w-11 font-mono text-[10px] uppercase pt-0.5 ${f.who === 'agent' ? 'text-accent' : 'text-glass'}`}>{f.who}</span><span className={f.who === 'you' ? 'text-mute' : ''}>{f.text}</span></li>)}
          {!s.feed.length && <li className="text-mute font-mono text-[11px]">nothing yet — the agent's actions and yours will appear here</li>}
        </ul>
      </section>
      {!atWholeHome(s) && <section className="p-5 border-b border-line">
        <div className="text-[11px] uppercase tracking-wider text-mute mb-2">Room</div>
        <div className="flex items-center gap-2 text-[12px]">
          <Num label="width" value={s.room.w} onChange={v => { resizeRoom(v, s.room.h); humanEvent({ action: 'room', to: { w: v, h: s.room.h }, text: `resized the room to ${v}×${s.room.h}cm` }) }} />
          <span className="text-mute">×</span>
          <Num label="depth" value={s.room.h} onChange={v => { resizeRoom(s.room.w, v); humanEvent({ action: 'room', to: { w: s.room.w, h: v }, text: `resized the room to ${s.room.w}×${v}cm` }) }} />
          <span className="text-mute">cm</span>
        </div>
        {sel && <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wider text-mute mb-1.5">{spec(sel.type).label} · {sel.id}</div>
          <div className="flex items-center gap-2 text-[12px]">
            <Num label="w" value={sel.w} onChange={v => { push(); updateItem(sel.id, { w: v }); humanEvent({ action: 'resized', item: sel.id, to: { w: v, h: sel.h }, text: `resized the ${spec(sel.type).label.toLowerCase()} to ${v}×${sel.h}cm` }) }} />
            <span className="text-mute">×</span>
            <Num label="h" value={sel.h} onChange={v => { push(); updateItem(sel.id, { h: v }); humanEvent({ action: 'resized', item: sel.id, to: { w: sel.w, h: v }, text: `resized the ${spec(sel.type).label.toLowerCase()} to ${sel.w}×${v}cm` }) }} />
            <span className="text-mute">cm</span>
          </div>
        </div>}
              <div className="text-[11px] text-mute mt-1.5">{imperial(s.room.w)} × {imperial(s.room.h)} · {(s.room.w * s.room.h / 10000).toFixed(1)} m²</div>
</section>}

      {!atWholeHome(s) && <section className="p-5 border-b border-line">
        <div className="text-[11px] uppercase tracking-wider text-mute mb-2">Goal</div>
        <div className="flex flex-wrap gap-1.5">
          {PROFILES.map(x => <button key={x} onClick={() => { const was = s.profile; set({ profile: x }); humanEvent({ action: 'goal', from: was, to: x, text: `changed the goal to ${x}` }) }} className={`px-2.5 py-1 rounded-full border text-[12px] ${s.profile === x ? 'bg-accent text-bg border-accent' : x === 'accessibility' && s.profile !== 'accessibility' ? 'border-accent/50 text-accent hover:bg-accent hover:text-bg' : 'border-line text-mute hover:text-ink'}`}>{x}</button>)}
        </div>
        {s.profile !== 'accessibility' && <p className="text-[11px] text-mute mt-2">Change the goal and the rules change with it — <span className="text-accent">accessibility</span> adds turning circles, widens every walkway, and gives your agent a tool it did not have.</p>}
      </section>}

      {!atWholeHome(s) && <section className="p-5 border-b border-line">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wider text-mute">Daylight</div>
          <div className="font-mono text-[12px] text-accent">{String(s.hour).padStart(2, '0')}:00</div>
        </div>
        <input type="range" min={0} max={23} value={s.hour} aria-label="Time of day" aria-valuetext={`${String(s.hour).padStart(2, '0')}:00`} onChange={e => set({ hour: +e.target.value })} onPointerUp={() => humanEvent({ action: 'time', to: s.hour, text: `set the time to ${s.hour}:00` })} onKeyUp={() => humanEvent({ action: 'time', to: s.hour, text: `set the time to ${s.hour}:00` })} className="w-full accent-[#f5b544]" />
        <div className="flex justify-between text-[10px] text-mute font-mono"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-mute">
          <span className="text-accent">☀</span><span>{solar(s.hour, s.room).up ? solar(s.hour, s.room).label : 'below the horizon'}</span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[12px]">
          <span className="text-[11px] uppercase tracking-wider text-mute">Top wall faces</span>
          <select aria-label="Which way the top wall faces" value={s.room.north ?? 0} onChange={e => { set({ room: { ...s.room, north: +e.target.value } }); humanEvent({ action: 'orientation', to: +e.target.value, text: `set the top wall to face ${compass(+e.target.value)}` }) }}
            className="bg-bg border border-line rounded px-2 py-1 text-[12px] outline-none focus:border-accent">
            {[0, 45, 90, 135, 180, 225, 270, 315].map(b => <option key={b} value={b}>{compass(b)}</option>)}
          </select>
          <select aria-label="Season" value={s.room.season ?? 'spring'} onChange={e => { set({ room: { ...s.room, season: e.target.value as Season } }); humanEvent({ action: 'season', to: e.target.value, text: `set the season to ${e.target.value}` }) }}
            className="bg-bg border border-line rounded px-2 py-1 text-[12px] outline-none focus:border-accent">
            {SEASONS.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        {Object.keys(s.layouts).length > 0 && <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wider text-mute mb-1.5">Options</div>
          <div className="flex gap-1.5">{Object.keys(s.layouts).map(n => <button key={n} onClick={() => { push(); set({ items: s.layouts[n].map(i => ({ ...i })), path: null }); humanEvent({ action: 'layout', to: n, text: `switched to option “${n}”` }) }} className="px-3 py-1 rounded-md border border-line hover:border-accent text-[12px]">{n}</button>)}</div>
        </div>}
      </section>}

      {!atWholeHome(s) && <section className="p-5 border-b border-line">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] uppercase tracking-wider text-mute">Rules</div>
          <div className="flex items-baseline gap-2 font-mono">
            {s.baseline && <span className="text-[12px] text-mute" title="what the page's own greedy arranger scored — the agent's job is to beat it">auto {s.baseline.score}</span>}
            {s.baseline && <span className="text-mute text-[12px]">→</span>}
            <span className={`text-lg ${sc >= 90 ? 'text-green' : sc >= 60 ? 'text-accent' : 'text-red'}`}
              aria-live="polite" aria-label={`Scores ${sc} out of 100. ${V.length ? `${V.length} problem${V.length > 1 ? 's' : ''}.` : 'Every rule passes.'}`}>
              {sc}<span className="text-mute text-xs">/100</span></span>
          </div>
        </div>
        <ul className="space-y-1.5">
          {PROFILE_RULES[s.profile].map(r => { const vs = byRule.get(r) ?? []; const sev = vs.some(v => v.severity === 'error') ? 'error' : vs.length ? 'warn' : 'ok'
            return <li key={r} className="flex items-center gap-2">
              <span className={`tick w-4 h-4 rounded-full grid place-items-center text-[10px] ${sev === 'ok' ? 'bg-green/15 text-green' : sev === 'warn' ? 'bg-accent/15 text-accent' : 'bg-red/15 text-red'}`}>{sev === 'ok' ? '✓' : vs.length}</span>
              <span className={sev === 'ok' ? 'text-mute' : ''}>{RULE_LABEL[r]}</span>
            </li> })}
        </ul>
        {V.length > 0 && <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {V.slice(0, 30).map((v, i) => <li key={i} className="rise text-[12px] flex gap-2 items-start"><span className={v.severity === 'error' ? 'text-red' : 'text-accent'}>●</span><span className="flex-1">{v.msg}{v.fix && <span className="text-mute"> — {v.fix}</span>}</span>
            {DEV && v.items[0] && s.items.some(i => i.id === v.items[0]) && <button onClick={() => fixOne(v.items[0])} className="shrink-0 px-2 py-0.5 rounded border border-line text-[11px] text-mute hover:text-ink hover:border-accent">fix</button>}</li>)}
          {V.length > 30 && <li className="text-mute text-[11px]">+{V.length - 30} more</li>}
        </ul>}
      </section>}

      {!atWholeHome(s) && <section className="p-5 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-mute mb-2">Add</div>
        <div className="flex flex-wrap gap-1">
          {CATALOG_TYPES.map(t => <button key={t} onClick={() => { push(); const it = addItem(t, s.room.w / 2 - spec(t).w / 2, s.room.h / 2 - spec(t).h / 2); set({ selected: it.id }); humanEvent({ action: 'added', item: it.id, to: t, text: `added a ${spec(t).label.toLowerCase()} (${it.id}) in the middle of the room` }) }} className="px-2 py-1 rounded border border-line text-[11px] text-mute hover:text-ink hover:border-mute">{spec(t).label}</button>)}
        </div>
        <p className="text-mute text-[11px] mt-2">Drag to move · R rotates · arrows nudge · ⌫ removes</p>
      </section>}

    </aside>
  )
}
const PREFER: Partial<Record<string, Prefer>> = { tv_unit: 'near_outlet', desk: 'near_outlet', lamp: 'near_outlet', bookshelf: 'wall', wardrobe: 'wall', bed_double: 'wall', bed_single: 'wall', plant: 'corner' }
/** move one offending item to the first legal spot the page can find */
function fixOne(id: string) {
  const it = getItem(id); if (!it) return
  const screen = state.items.find(i => spec(i.type).screen)?.id, seat = state.items.find(i => spec(i.type).seat)?.id
  // try the ideal placement first, then relax until something fits
  const tries: Parameters<typeof findSpace>[] = [
    [it.w, it.h, it.type, PREFER[it.type] ?? 'any', spec(it.type).seat ? undefined : seat, spec(it.type).seat ? screen : undefined],
    [it.w, it.h, it.type, PREFER[it.type] ?? 'any'],
    [it.w, it.h, it.type, 'any'],
  ]
  let c: ReturnType<typeof findSpace>['candidates'][number] | undefined
  for (const t of tries) { c = findSpace(...t).candidates[0]; if (c) break }
  if (!c) return
  push(); updateItem(id, { x: c.x, y: c.y, rot: c.rot }); flash([id]); humanEvent({ action: 'fix', item: id, text: `pressed fix on ${id}` })
}


/** The agent's tool list is not fixed: the page registers and unregisters tools as the room changes,
 *  so what the agent can do is always what makes sense right now. Newly-arrived tools glow. */
/** The tools that only exist in some rooms, and the reason each one is there. */
const WHY_HERE: Record<string, string> = {
  access_check: 'this room is judged on accessibility',
  bedside_check: 'there is a bed in here',
  work_triangle: 'this kitchen has a hob in it',
}

function ToolList({ names }: { names: string[] }) {
  const prev = useRef<string[]>([])
  const fresh = names.filter(n => prev.current.length && !prev.current.includes(n))
  useEffect(() => { prev.current = names }, [names])
  const [open, setOpen] = useState(false)
  if (!names.length) return null
  return <div className="mb-3 rounded-lg bg-bg border border-line p-3">
    <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
      <span className="text-[11px] uppercase tracking-wider text-mute">Tools your agent can see</span>
      <span className="font-mono text-[12px] text-accent">{names.length}<span className="text-mute ml-1">{open ? '▾' : '▸'}</span></span>
    </button>
    {open && <div className="mt-2 flex flex-wrap gap-1">
      {names.map(n => <span key={n} className={`px-1.5 py-0.5 rounded font-mono text-[10px] border ${fresh.includes(n) ? 'border-accent text-accent flash-in' : 'border-line text-mute'}`}>{n}</span>)}
    </div>}
    {/* Telling someone to switch to accessibility while they are standing in a bathroom, which set
        itself to accessibility on the way in and already grew the tool, describes a future that has
        happened. Name the tool that is actually in the list, and why it is. */}
    <p className="text-mute text-[11px] mt-2">{(() => { const why = names.map(n => [n, WHY_HERE[n]] as const).find(([, w]) => w)
      return why
        ? <>This list changes with the room — <span className="font-mono text-ink">{why[0]}</span> is in it because {why[1]}. Leave the room and it goes.</>
        : <>This list changes with the room — set the goal to <span className="text-ink">accessibility</span> and a wheelchair audit tool appears.</> })()}</p>
  </div>
}
