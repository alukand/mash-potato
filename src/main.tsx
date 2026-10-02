import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeAuthLinks } from './lib/authLinks'
import { flagStore } from './lib/flags'

// Feature flags are fetched once per launch and never hold up the first
// paint: until the server answers, every flag reads off (lib/featureFlags.ts).
void flagStore.load()

void initializeAuthLinks().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
