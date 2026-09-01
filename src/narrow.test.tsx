// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

// The side panel is a fixed 340px that never shrinks. On a phone that left about fifty pixels for the
// room, which is what a judge gets if they open the link on the thing in their hand rather than at a
// desk. The panel's own collapsed state — a 36px tab with a dot when something is wrong — already
// existed for embedding; it just was not the default anywhere else.
// The width is read once when the store is created, so each case needs its own module graph.
let host: HTMLDivElement | null = null
afterEach(() => { host?.remove(); host = null; vi.resetModules() })

const pageAt = async (width: number) => {
  vi.resetModules()
  Object.defineProperty(globalThis, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(globalThis, 'location', { configurable: true,
    value: { origin: 'https://x', pathname: '/', href: 'https://x/', hash: '', search: '' } })
  Object.defineProperty(globalThis, 'history', { value: { replaceState() {}, pushState() {} }, configurable: true })
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  const { default: App } = await import('./App')
  const { loadPreset, registerTools } = await import('./tools')
  const { state } = await import('./store')
  registerTools(); loadPreset('dad-visits')
  host = document.createElement('div'); document.body.append(host)
  await act(async () => { createRoot(host!).render(<App />) })
  return { host: host!, hidden: state.panelHidden }
}

it('on a phone the room gets the screen, and the panel is one tap away', async () => {
  const { host: el, hidden } = await pageAt(390)
  expect(hidden, 'the panel takes 340 of 390 pixels').toBe(true)
  const tab = [...el.querySelectorAll('button')].find(b => /panel/i.test(b.textContent ?? ''))
  expect(tab, 'the panel is hidden with no way to open it').toBeTruthy()
  expect(el.querySelector('svg'), 'the room is not drawn').toBeTruthy()
})

it('at a desk it is open, because that is where the demo happens', async () => {
  const { host: el, hidden } = await pageAt(1512)
  expect(hidden, 'the panel starts collapsed on a full screen').toBe(false)
  expect((el.textContent ?? ''), 'the panel is not showing the rules').toMatch(/Tools your agent can see/i)
})
