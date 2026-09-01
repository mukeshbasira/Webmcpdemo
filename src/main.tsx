import { StrictMode } from 'react'
import { Boundary } from './Boundary'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { openFrom, registerTools } from './tools'
import { rememberSession, state, subscribe } from './store'

declare const __BUILD__: string
// so smoke.sh can ask the live page which build it is
;(window as unknown as Record<string, string>).__ROOM_BUILD__ = __BUILD__

registerTools()
openFrom(location.search, location.hash)

// keep the session on this machine, and nowhere else
let saveAt = 0
subscribe(() => {
  if (!state.presetId || Date.now() - saveAt < 800) return
  saveAt = Date.now(); rememberSession()
})
addEventListener('pagehide', () => { if (state.presetId) rememberSession() })
createRoot(document.getElementById('root')!).render(<StrictMode><Boundary><App /></Boundary></StrictMode>)
