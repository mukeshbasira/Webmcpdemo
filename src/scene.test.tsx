// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { Scene3D } from './Scene3D'
import { loadPreset } from './tools'
import { state } from './store'

// jsdom has no WebGL, so exactly one path through this file can be tested honestly — and it happens
// to be the one that matters most to someone who cannot see the demo: what the page does on a machine
// that cannot draw it. Everything else here needs a GPU, and a test that mocked one would be asserting
// about the mock. The lazy() wrapper in App is what defeated an earlier attempt at this; importing the
// component directly steps around it.
let host: HTMLDivElement | null = null
beforeAll(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
})
afterEach(() => { host?.remove(); host = null })

const mount = () => {
  host = document.createElement('div'); document.body.append(host)
  act(() => { createRoot(host!).render(<Scene3D V={[]} />) })
  return host
}

it('a browser that cannot draw it is told why, and given the way back', () => {
  loadPreset('dad-visits')
  const el = mount()
  expect(el.textContent, 'the 3D view failed silently and left an empty box').toContain('cannot draw the 3D view')
  expect(el.textContent, 'it does not say what still works').toMatch(/plan, the rules, the agent's tools/)
  const back = [...el.querySelectorAll('button')].find(b => /back to the plan/i.test(b.textContent ?? ''))
  expect(back, 'no way out of a view this browser cannot show').toBeTruthy()
  act(() => { back!.click() })
  expect(state.view, 'the way back does not go back').toBe('2d')
})
