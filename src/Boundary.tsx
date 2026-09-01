import { Component, type ReactNode } from 'react'

/** A page that has been open across a deploy asks for a chunk that no longer exists, and the browser
 *  says "Failed to fetch dynamically imported module". That is not a broken page, it is an old one —
 *  and it should not read like a crash, or take the room down with it. */
const staleChunk = (e: Error) => /dynamically imported module|Importing a module script failed|Loading chunk/i.test(String(e?.message))

export class Boundary extends Component<{ children: ReactNode; only?: string }, { e?: Error }> {
  state: { e?: Error } = {}
  static getDerivedStateFromError(e: Error) { return { e } }
  render() {
    const { e } = this.state
    if (!e) return this.props.children
    const stale = staleChunk(e)
    return <div style={{ padding: 32, fontFamily: 'system-ui', color: '#e8eaf0', display: 'grid', placeItems: 'center', height: '100%', textAlign: 'center' }}>
      <div style={{ maxWidth: 520 }}>
        <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28 }}>
          {stale ? 'This page was updated while you had it open.' : 'Something broke.'}</h2>
        <p style={{ color: '#8b93a7' }}>{stale
          ? `Reload to get the new version.${this.props.only ? ` Everything else still works — ${this.props.only} is the only part that needs it.` : ''}`
          : String(e.message)}</p>
        <button onClick={() => location.reload()} style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid #2b303b', background: 'transparent', color: '#f5b544', cursor: 'pointer' }}>Reload</button>
      </div>
    </div>
  }
}
