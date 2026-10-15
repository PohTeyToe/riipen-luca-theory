import { useCallback, useRef, useState, type ReactNode } from 'react'
import { AgentPanel } from '../components/AgentPanel'
import { DomainGrid } from '../components/DomainGrid'
import { Exhibit, Section } from '../components/Exhibit'
import { Footer } from '../components/Footer'
import { LineSlider } from '../components/LineSlider'
import { MarketGap, RatingBands } from '../components/Market'
import { BatchStrip, PlanTable, SupplyLine } from '../components/Plan'
import { ProofStrip } from '../components/ProofStrip'
import { Scorecard } from '../components/Scorecard'
import { TheChange } from '../components/TheChange'
import { OWNER, SUPERFORECASTER_POST, confidenceRow, int, page, pulled, score2, shortDate } from '../data'

const { line, domains, king, market, quotes, season } = page
const sbf = domains.notes.sbf
const wood = domains.notes.wood
const [lowBand, highBand] = line.bands
const c9 = confidenceRow(9)
// Copy names the Policy Insider agent as closest; the build checks that still holds.
const insider = market.rows.find((r) => r.id === 'insider')!
const tens = (n: number) => Math.round(n / 10) * 10
const METHODOLOGY = 'https://street.lucatheory.com/methodology'

const contents = [
  ['line', 'The line'],
  ['scorecard', 'Scorecard'],
  ['market', 'Against the market'],
  ['domains', 'By domain'],
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
                    <span className="toc-n" aria-hidden="true">
                      {i + 1}
                    </span>
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
                Your <a href={METHODOLOGY}>methodology page</a> says: "{quotes.binaryCommitment.text}" The published Brier
                scores come back exactly if you divide that rating by 15 and read it as the chance the agent's own side is
                right. Drag it and watch one pick.
              </p>
            </div>
            <LineSlider />
            <p className="source">
              <Src>street.lucatheory.com/api/predictions for the {int(line.scoredPicks)} scored bets, and /methodology for the quotes</Src>
            </p>
          </Section>

          <Section id="scorecard" n={2} title="The ranking, both ways">
            <div className="prose">
              <p>
                Trust sets how much each agent's vote counts in the King's consensus. My replay matches that consensus on all{' '}
                {king.consensusMatches} bets that list each vote, so this ranking is what a scoring change moves in the
                product. Switch it to "Fixed" and watch who moves.
              </p>
            </div>
            <Exhibit
              n={1}
              title="Brier score and trust by agent, as scored and fixed"
              source={<Src>street.lucatheory.com/api/predictions and /api/trust-scores. Fixed scores and fixed trust are my proposal</Src>}
            >
              <Scorecard selected={openId} onOpen={openAgent} />
              <p className="caption">
                Settled bets with a stake: the same {int(line.scoredPicks)} your analytics count. Trust is your formula: from
                35 settled bets on, it's 30% base trust and 70% Brier, and all ten agents are past 35. Tap a row for the
                agent's own bets.
              </p>
            </Exhibit>
            <div className="prose">
              <p>
                The Simons agent drops because, as scored, a confident miss costs little. Almost all its losses are rated 8
                or higher, and a losing 9 costs {score2(c9.asScored.loss)} as scored against {score2(c9.fixed.loss)} fixed.
              </p>
            </div>
          </Section>

          <Section id="market" n={3} title="Who beats the market price">
            <div className="prose">
              <p>
                The fixed reading is a stopgap, because neither reading makes the rating a probability. Bets rated{' '}
                {highBand.from} or higher won {highBand.wonPercent}% of the time. As scored that rating reads as{' '}
                {highBand.asScoredPercent}%, and fixed as {highBand.fixedPercent}%. The market's price at entry said{' '}
                {highBand.marketPercent}%.
              </p>
            </div>
            <Exhibit
              n={2}
              title="What a rating says, against what happened"
              source={<Src>street.lucatheory.com/api/predictions, {int(line.scoredPicks)} scored bets with their market price at entry</Src>}
            >
              <RatingBands />
              <p className="caption">
                Bets rated {lowBand.from} to {lowBand.to} won {lowBand.wonPercent}%; the market priced them at{' '}
                {lowBand.marketPercent}%. In both halves of the scale the market's price tracks the win rate and neither
                reading does.
              </p>
            </Exhibit>
            <div className="prose">
              <p>
                So the fair test of a forecaster is whether it wins more often than the market's price said it would.
              </p>
            </div>
            <Exhibit
              n={3}
              title="Win rate against the market price at entry, by agent"
              source={
                <Src>
                  street.lucatheory.com/api/predictions. The comparison and the luck range are mine: the range is where 95% of
                  win rates would land over the same bets if the market's prices were right
                </Src>
              }
            >
              <MarketGap />
              <p className="caption">
                Market is the win rate the market's prices at entry implied for each agent's bets. Every agent sits inside the
                range luck alone covers. Agents sometimes bet on the same contract in more than one week, so those bets count
                as one shared outcome. The range doesn't model links between different contracts, such as two markets on one
                election.
              </p>
            </Exhibit>
            <div className="prose">
              <p>
                No agent clearly beats the market yet. The Policy Insider agent comes closest: it won {insider.wonPercent}% of
                its bets where the market's prices implied {insider.marketPercent}%. The Munger and Ackman agents, which the fixed reading
                moves up, are within about 2 points of the market's price. Season 1 gave each agent {market.settledMin} to{' '}
                {market.settledMax} settled bets. To spot a real {market.edgePoints}-point edge 4 times in 5 takes about{' '}
                {tens(market.betsForEdgeMin)} to {tens(market.betsForEdgeMax)} per agent, each on a different contract.
              </p>
              <p>
                These two tests are also how I'd answer the question you asked{' '}
                <a href={SUPERFORECASTER_POST.url}>on LinkedIn on {SUPERFORECASTER_POST.date}</a>: "{SUPERFORECASTER_POST.text}"
                Your <a href={quotes.calibration.page}>Benchmarks essay</a> says the gap between benchmark and live results
                tracks "{quotes.calibration.text}" Exhibit 2 is a calibration check and Exhibit 3 an edge check. Both work for
                any model, so they could score Season 2, or models head to head on the same events.
              </p>
            </div>
          </Section>

          <Section id="domains" n={4} title="Trust by domain">
            <div className="prose">
              <p>
                Your <a href={quotes.lastMile.page}>Last-Mile Accuracy essay</a> says "{quotes.lastMile.text}" Here's Season 1
                split by domain. Trust runs on Brier, so per-domain trust would too. Until picks carry a stated probability,
                this uses the stopgap reading. Tap a cell for its win rate against what the market's prices implied for the
                same bets.
              </p>
            </div>
            <Exhibit
              n={4}
              title="Fixed Brier score by domain"
              source={<Src>street.lucatheory.com/api/predictions and /api/events. The blend and cell trust are my proposal</Src>}
            >
              <DomainGrid />
              <div className="notes">
                <p>
                  <b>SAIm BAInkman-FrAIed</b> was built as the crypto degen. In Season 1 it's the best agent on geopolitics,{' '}
                  {sbf.geopolitics.wins} and {sbf.geopolitics.losses}, where the market's prices implied{' '}
                  {sbf.geopolitics.marketPercent}%. That's {Math.round(sbf.geopolitics.gapPoints ?? 0)} points over the market,
                  which luck alone could still produce on {sbf.geopolitics.n} bets. On politics it went {sbf.politics.wins}{' '}
                  and {sbf.politics.losses}, right at the market's {sbf.politics.marketPercent}%.
                </p>
                <p>
                  <b>CAIthy Wood</b> was built around exponential tech and blockchain. It went {wood.tech.wins} and{' '}
                  {wood.tech.losses} on tech and {wood.crypto.wins} and {wood.crypto.losses} on crypto, against{' '}
                  {wood.politics.wins} and {wood.politics.losses} on politics. Those cells are too thin to trust alone, so the
                  blend pulls them most of the way to its overall score.
                </p>
              </div>
              <p className="caption">
                Every cell is blended toward the agent's overall score, as if it had {String(page.method.prior)} more picks
                there. Hatched cells have under {String(page.method.thinBelow)}, so the blend carries most of their weight.{' '}
                {domains.politicsPercent}% of Season 1's scored events were politics. Per-domain trust needs more resolved
                events outside politics, and that's a choice for Season 2's batches.
              </p>
            </Exhibit>
          </Section>

          <Section id="change" n={5} title="The change" kicker="For whoever builds it">
            <Exhibit
              n={5}
              title="What I'd change"
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
            <Exhibit n={6} title="Season 1 by week" source={<Src>street.lucatheory.com/api/batches/all and /api/events; Polymarket's public Gamma API for the market count</Src>}>
              <BatchStrip />
              <p className="caption">
                Season 1 moved to "{season.status}" on {shortDate(season.crystallisedAt)}. Season 2 needs a batch every week,
                and about {tens(market.betsForEdgeMin)} to {tens(market.betsForEdgeMax)} settled bets per agent, each on a
                different contract, to tell a {market.edgePoints}-point edge from luck.
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
