import { useCallback, useRef, useState, type ReactNode } from 'react'
import { AgentPanel } from '../components/AgentPanel'
import { DomainGrid } from '../components/DomainGrid'
import { Exhibit, Section } from '../components/Exhibit'
import { Footer } from '../components/Footer'
import { KingTable } from '../components/KingTable'
import { LineSlider } from '../components/LineSlider'
import { BatchStrip, PlanTable, SupplyLine } from '../components/Plan'
import { ProofStrip } from '../components/ProofStrip'
import { Scorecard } from '../components/Scorecard'
import { TheChange } from '../components/TheChange'
import { OWNER, int, page, pulled, shortDate } from '../data'

const { line, domains, king, quotes, season } = page
const sbf = domains.notes.sbf
const wood = domains.notes.wood
const edgePoints = Math.round(king.edgeThreshold * 100)
const ruleLine =
  king.ruleMatches === king.betsWithBreakdown
    ? `all ${king.betsWithBreakdown} of the real calls`
    : `${king.ruleMatches} of the ${king.betsWithBreakdown} real calls`

const contents = [
  ['line', 'The line'],
  ['scorecard', 'Scorecard'],
  ['domains', 'By domain'],
  ['king', 'The King'],
  ['change', 'The change'],
  ['plan', 'Plan'],
] as const

const Src = ({ children }: { children: ReactNode }) => (
  <>
    Source: {children}, pulled {pulled}. Play money.
  </>
)

export function Season() {
  const [openId, setOpenId] = useState<string | null>(null)
  const trigger = useRef<HTMLElement | null>(null)

  const openAgent = useCallback((id: string, from: HTMLElement) => {
    trigger.current = from
    setOpenId(id)
  }, [])
  const close = useCallback(() => {
    setOpenId(null)
    trigger.current?.focus({ preventScroll: true })
  }, [])

  return (
    <>
      <main className="season">
        <header className="masthead wrap">
          <p className="eyebrow">
            <a href="/">Start with the intro</a>
          </p>
          <h1>Agent Street Season 1, rescored</h1>
          <p className="byline">
            {OWNER.name}, {pulled}
          </p>
          <p className="affil">Not affiliated with LUCA Theory</p>
          <nav aria-label="Contents" className="contents">
            <ol>
              {contents.map(([id, label], i) => (
                <li key={id}>
                  <a href={`#${id}`}>
                    <span className="toc-n">{i + 1}</span>
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </header>

        <div className="wrap">
          <ProofStrip />

          <Section id="line" n={1} title="One line decides who looks good">
            <div className="prose">
              <p>
                Your methodology page says: "{quotes.binaryCommitment.text}" The published Brier scores come back exactly
                if you divide that rating by 15 and read it as the chance the agent's own side is right. Drag it and watch
                one pick.
              </p>
            </div>
            <LineSlider />
            <p className="source">
              <Src>street.lucatheory.com/api/predictions for the {int(line.scoredPicks)} scored bets, and /methodology for the quote</Src>
            </p>
          </Section>

          <Section id="scorecard" n={2} title="The ranking, both ways">
            <div className="prose">
              <p>
                Trust sets how much each agent's vote counts in the King's consensus, so this ranking is what the fix
                changes in the product. Switch it to "Fixed" and watch who moves.
              </p>
            </div>
            <Exhibit
              n={1}
              title="Brier score and trust by agent, as scored and fixed"
              source={<Src>street.lucatheory.com/api/predictions and /api/trust-scores. Fixed scores and fixed trust are my proposal</Src>}
            >
              <Scorecard selected={openId} onOpen={openAgent} />
              <p className="caption">
                Settled bets with a stake: the same {int(line.scoredPicks)} your analytics count. Trust uses your formula at
                its 0.3 floor. Tap a row for the agent's own bets.
              </p>
            </Exhibit>
          </Section>

          <Section id="domains" n={3} title="Trust by domain">
            <div className="prose">
              <p>
                Your <a href={quotes.lastMile.page}>FAQ</a> says "{quotes.lastMile.text}" Here's Season 1 split by domain,
                scored the fixed way.
              </p>
            </div>
            <Exhibit
              n={2}
              title="Fixed Brier score by domain"
              source={<Src>street.lucatheory.com/api/predictions and /api/events. The blend and cell trust are my proposal</Src>}
            >
              <DomainGrid />
              <div className="notes">
                <p>
                  <b>SAIm BAInkman-FrAIed</b> was built as the crypto degen. In Season 1 it's the best geopolitics
                  forecaster on the board, {sbf.geopolitics.wins} and {sbf.geopolitics.losses}, and middling on politics,{' '}
                  {sbf.politics.wins} and {sbf.politics.losses}.
                </p>
                <p>
                  <b>CAIthy Wood</b> was built around exponential tech and blockchain. It went {wood.tech.wins} and{' '}
                  {wood.tech.losses} on tech and {wood.crypto.wins} and {wood.crypto.losses} on crypto, against{' '}
                  {wood.politics.wins} and {wood.politics.losses} on politics. Those cells are too thin to trust alone, which
                  is why they're blended.
                </p>
              </div>
              <p className="caption">
                {domains.politicsPercent}% of Season 1's scored events were politics. Per-domain trust needs more resolved
                events outside politics, and that's a choice for Season 2's batches.
              </p>
            </Exhibit>
          </Section>

          <Section id="king" n={4} title="What the King would have called">
            <div className="prose">
              <p>
                Your King weights each vote by trust x confidence / 15. I rebuilt that for the {king.betsWithBreakdown} bets
                that list each agent's vote, and it matches all {king.consensusMatches}. With the trust recorded on each bet,
                my version of the execute rule (anchors agree, edge at least {edgePoints} points) reproduces {ruleLine}. Then
                I swapped end-of-season trust as scored for end-of-season trust fixed.
              </p>
            </div>
            <Exhibit
              n={3}
              title="King calls that change with fixed trust (hindsight)"
              source={
                <Src>
                  street.lucatheory.com/api/king/bets and /api/events. The execute rule is my approximation, and the replay uses
                  end-of-season trust on bets made during the season
                </Src>
              }
            >
              <KingTable />
              <p className="caption">
                {king.changes} of {int(king.betsWithBreakdown)} calls change. {king.decisionChanges} change the decision;{' '}
                {king.leanOnlyChanges} only change which way a wait leans.
              </p>
            </Exhibit>
            <div className="prose">
              <p>
                Trust alone moves few calls. The next thing I'd want to understand is how the King turns a vote into a bet.
              </p>
            </div>
          </Section>

          <Section id="change" n={5} title="The change" kicker="For whoever builds it">
            <Exhibit
              n={4}
              title="What the fix looks like"
              source={<>Formula from street.lucatheory.com/methodology. Tests run on data/snapshot.json from the {pulled} pull. Play money.</>}
            >
              <TheChange />
            </Exhibit>
          </Section>

          <Section id="plan" n={6} title="How I'd spend my 60 hours">
            <div className="prose">
              <p className="label-line">A starting point for our first call.</p>
            </div>
            <PlanTable />
            <div className="prose plan-after">
              <p>If the Riipen project is a new product rather than Agent Street, the scoring and pipeline work carries over.</p>
              <p>If you place a UX and beta-test student, the Season 2 dry run is a natural test script for them.</p>
            </div>
            <Exhibit n={5} title="Season 1 by week" source={<Src>street.lucatheory.com/api/batches/all and /api/events; Polymarket's public Gamma API for the market count</Src>}>
              <BatchStrip />
              <p className="caption">
                Season 1 moved to "{season.status}" on {shortDate(season.crystallisedAt)}. Season 2 needs a batch every
                week.
              </p>
              <SupplyLine />
            </Exhibit>
          </Section>
        </div>
      </main>
      <Footer />
      {openId && <AgentPanel id={openId} onClose={close} />}
    </>
  )
}

