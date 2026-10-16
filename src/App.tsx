import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgentPanel } from './components/AgentPanel'
import { Calibration } from './components/Calibration'
import { Header } from './components/Header'
import { How } from './components/How'
import { King } from './components/King'
import { Market } from './components/Market'
import { Ranking } from './components/Ranking'
import { Reader } from './components/Reader'
import { ReadingControl } from './components/ReadingControl'
import { RunBar, type LiveState, type StepId } from './components/RunBar'
import { EMAIL, loadReaderRun, snapshot } from './data'
import type { RawPrediction } from './engine/dataset'
import { runPipeline } from './engine/pipeline'
import { type Decisions, type ReaderRun, type View, VIEWS } from './engine/reader'
import { AS_SCORED, type Dataset, type Pick, contractsOf, scoreAgents, won } from './engine/score'
import { pullLive, sha256 } from './lib/live'
import { pickKey, useTween } from './lib/ui'

export interface Source {
  kind: 'snapshot' | 'live'
  ds: Dataset
  /** The snapshot's pull date, or the live pull's ISO time. */
  at: string
}

export type Model = ReturnType<typeof buildModel>

function buildModel(source: Source) {
  const run = runPipeline(source.ds)
  const { ds } = source
  return {
    source,
    ds,
    run,
    byAgent: run.byAgent,
    scored: [...run.byAgent.values()].flat(),
    contractOf: contractsOf(ds),
    events: new Map(ds.events.map((e) => [e.id, e])),
  }
}

const SNAPSHOT: Source = { kind: 'snapshot', ds: snapshot, at: snapshot.pullDate }

// The pick the inspector opens on: Ackman's rated-2 NO on the Iranian regime,
// won at a 98% NO price. Other agents open on their latest low-rated win.
const DEFAULT_AGENT = 'ackman'
const DEFAULT_EVENT_TEXT = 'Iranian regime fall by September 30'

function defaultBet(model: Model, agentId: string): string | null {
  const picks = model.byAgent.get(agentId) ?? []
  const latest = (xs: Pick[]) => xs.reduce<Pick | null>((m, p) => (!m || p.createdAt > m.createdAt ? p : m), null)
  const lowWins = picks.filter((p) => p.confidence <= 7 && won(p))
  const named = lowWins.filter((p) => model.events.get(p.eventId)?.question.includes(DEFAULT_EVENT_TEXT))
  const p = latest(named) ?? latest(lowWins) ?? latest(picks)
  return p ? pickKey(p) : null
}

const SAVED_CALLS = 'luca-rescore:reader-calls'

function readSaved(): Decisions {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SAVED_CALLS) ?? '{}')
    if (!raw || typeof raw !== 'object') return {}
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => (VIEWS as unknown[]).includes(v))) as Decisions
  } catch {
    return {}
  }
}

export function App() {
  const [source, setSource] = useState<Source>(SNAPSHOT)
  const model = useMemo(() => buildModel(source), [source])
  // The reader run was made on the Oct 15 pull, so its section always joins to the snapshot.
  const recorded = useMemo(() => (source.kind === 'snapshot' ? model : buildModel(SNAPSHOT)), [model, source.kind])
  const [floor, setFloor, glideFloor] = useTween(AS_SCORED)
  const scores = useMemo(() => scoreAgents(model.ds, model.byAgent, floor), [model, floor])
  const [agentPick, setAgentId] = useState(DEFAULT_AGENT)
  // A live pull could drop an agent; fall back to the first one rather than break.
  const agentId = scores.some((s) => s.id === agentPick) ? agentPick : (scores[0]?.id ?? agentPick)
  const [betKey, setBetKey] = useState<string | null>(() => defaultBet(model, DEFAULT_AGENT))
  const [step, setStep] = useState<StepId | null>(null)
  const [howOpen, setHowOpen] = useState(false)
  const [live, setLive] = useState<LiveState>({ phase: 'idle' })
  const [records, setRecords] = useState<Map<string, RawPrediction> | null>(null)
  const [textsSame, setTextsSame] = useState<{ same: number; checked: number } | null>(null)
  const [readerRun, setReaderRun] = useState<ReaderRun | null>(null)
  const [readerFailed, setReaderFailed] = useState(false)
  const [decisions, setDecisions] = useState<Decisions>(readSaved)
  const pull = useRef<{ id: number; ctl: AbortController | null }>({ id: 0, ctl: null })

  useEffect(() => {
    let off = false
    loadReaderRun().then(
      (r) => !off && setReaderRun(r),
      () => !off && setReaderFailed(true),
    )
    return () => {
      off = true
    }
  }, [])

  // Once the API's own texts are here (a live pull or "Show the full text"), check
  // that they are still the texts the readers read.
  useEffect(() => {
    if (!records || !readerRun) return
    let off = false
    ;(async () => {
      let same = 0
      let checked = 0
      for (const p of readerRun.picks) {
        const text = records.get(p.key)?.reasoning
        const h = text != null ? await sha256(text) : null
        if (h === null) continue
        checked += 1
        if (h.slice(0, 16) === p.textSha) same += 1
      }
      if (!off) setTextsSame({ same, checked })
    })()
    return () => {
      off = true
    }
  }, [records, readerRun])

  const selectAgent = useCallback(
    (id: string) => {
      setAgentId(id)
      setBetKey(defaultBet(model, id))
    },
    [model],
  )

  const decide = useCallback((key: string, view: View | null) => {
    setDecisions((d) => {
      const next = { ...d }
      if (view) next[key] = view
      else delete next[key]
      try {
        localStorage.setItem(SAVED_CALLS, JSON.stringify(next))
      } catch {
        /* storage blocked: the calls still apply for this visit */
      }
      return next
    })
  }, [])

  // Anchors, on load and on every hash change: #proof opens the match table, #how
  // the method panel, others scroll. #your-call renders only once the reader run
  // has loaded, so a target that isn't there yet waits for it.
  const pendingHash = useRef<string | null>(null)
  useEffect(() => {
    const go = () => {
      let id = ''
      try {
        id = decodeURIComponent(window.location.hash.slice(1))
      } catch {
        return
      }
      if (id === 'proof') setStep('match')
      if (id === 'how') setHowOpen(true)
      const target = id === 'proof' ? 'run' : id
      pendingHash.current = target || null
      if (!target) return
      requestAnimationFrame(() => {
        const el = document.getElementById(target)
        if (!el) return
        el.scrollIntoView()
        if (pendingHash.current === target) pendingHash.current = null
      })
    }
    go()
    window.addEventListener('hashchange', go)
    return () => window.removeEventListener('hashchange', go)
  }, [])
  useEffect(() => {
    const target = pendingHash.current
    if (!readerRun || !target) return
    pendingHash.current = null
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView())
  }, [readerRun])

  const rerunLive = useCallback(async () => {
    pull.current.ctl?.abort()
    const ctl = new AbortController()
    const id = pull.current.id + 1
    pull.current = { id, ctl }
    const current = () => pull.current.id === id && !ctl.signal.aborted
    setStep('pull')
    setLive({ phase: 'fetching', fetched: [] })
    try {
      const got = await pullLive((f) => current() && setLive((s) => (s.phase === 'fetching' ? { ...s, fetched: [...s.fetched, f] } : s)), ctl.signal)
      if (!current()) return
      setRecords(new Map(got.records.map((r) => [pickKey(r), r])))
      setSource({ kind: 'live', ds: got.ds, at: got.at })
      setLive({ phase: 'done', fetched: got.fetched, fetchMs: got.fetchMs, parseMs: got.parseMs, at: got.at })
    } catch (e) {
      if (!current()) return
      setLive((s) => ({ phase: 'error', fetched: s.phase === 'fetching' ? s.fetched : [], message: e instanceof Error ? e.message : String(e) }))
    }
  }, [])

  const backToSnapshot = useCallback(() => {
    pull.current.ctl?.abort()
    pull.current = { id: pull.current.id + 1, ctl: null }
    setSource(SNAPSHOT)
    setLive({ phase: 'idle' })
  }, [])

  // Stable, or the open panel would take focus back on every render (its effect depends on it).
  const closeHow = useCallback(() => setHowOpen(false), [])

  const score = scores.find((s) => s.id === agentId)

  // RunBar, Reader, King and Market are memoised and get stable props, so a slider
  // drag or a click re-renders only the sections that change with it.
  return (
    <>
      <Header howOpen={howOpen} onHow={() => setHowOpen((v) => !v)} />
      {howOpen && <How onClose={closeHow} />}
      <main>
        <RunBar
          model={model}
          step={step}
          setStep={setStep}
          live={live}
          onLive={rerunLive}
          onSnapshot={backToSnapshot}
          readerRun={readerRun}
          readerFailed={readerFailed}
          textsSame={textsSame}
        />
        <section className="instrument" aria-label="Rescore">
          <ReadingControl floor={floor} setFloor={setFloor} glide={glideFloor} scored={model.scored.length} />
          <div className="wrap split">
            <Ranking scores={scores} floor={floor} selected={agentId} onSelect={selectAgent} />
            {score && (
              <AgentPanel
                model={model}
                floor={floor}
                agentId={agentId}
                score={score}
                betKey={betKey}
                onBet={setBetKey}
                readerRun={readerRun}
                readerFailed={readerFailed}
                records={records}
                setRecords={setRecords}
              />
            )}
          </div>
        </section>
        <Calibration model={model} floor={floor} glide={glideFloor} />
        <Reader
          model={recorded}
          run={readerRun}
          failed={readerFailed}
          decisions={decisions}
          decide={decide}
          records={records}
          setRecords={setRecords}
        />
        <King model={model} />
        <Market model={model} agentId={agentId} onAgent={selectAgent} />
      </main>
      <footer className="foot">
        <div className="wrap foot-in">
          <span>Not affiliated with or endorsed by LUCA Theory. Agent Street ran on play money.</span>
          <span>
            Want it taken down? <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
          </span>
        </div>
      </footer>
    </>
  )
}
