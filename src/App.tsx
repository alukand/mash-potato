import { useState } from 'react'
import { sampleMembers, memberColor } from './lib/fixtures'
import { Logo } from './components/Logo'
import { BottomNav } from './components/BottomNav'
import type { TabId } from './components/BottomNav'
import { HomeScreen } from './screens/HomeScreen'
import { RateScreen } from './screens/RateScreen'
import { GroupScreen } from './screens/GroupScreen'

// App shell: brand header + tab switching + floating nav. Screens render
// sample fixture data through the tested scoring core — no backend yet.

function App() {
  const [tab, setTab] = useState<TabId>('home')

  return (
    <div className="min-h-dvh">
      <div className="mx-auto w-full max-w-[480px] px-5 pb-32">
        {/* ---- Header ---- */}
        <header className="flex items-center justify-between pt-7 pb-5">
          <div className="flex items-center gap-2.5">
            <Logo className="h-9 w-9" />
            <div>
              <h1 className="font-display text-[26px] font-semibold leading-none tracking-tight">
                Mash Potato
              </h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Film Club · {sampleMembers.length} members
              </p>
            </div>
          </div>
          <div className="flex -space-x-2">
            {sampleMembers.map((m) => (
              <span
                key={m.id}
                title={m.name}
                className="grid h-7 w-7 place-items-center rounded-full border-2 border-bg font-mono text-[10px] font-bold text-bg"
                style={{ backgroundColor: memberColor(m.id) }}
              >
                {m.name.charAt(0)}
              </span>
            ))}
          </div>
        </header>

        {/* key remounts the screen on tab change so the entrance plays again */}
        <main key={tab}>
          {tab === 'home' && <HomeScreen />}
          {tab === 'rate' && <RateScreen />}
          {tab === 'group' && <GroupScreen />}
        </main>

        <p className="mt-7 text-center font-mono text-[10px] text-muted">
          M3 · sample data · blind scoring UI — no backend yet
        </p>
      </div>

      <BottomNav active={tab} onSelect={setTab} />
    </div>
  )
}

export default App
