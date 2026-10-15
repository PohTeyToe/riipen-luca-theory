import { Footer } from '../components/Footer'
import { OWNER, REPO, SUPERFORECASTER_POST, agent, brier3, confidenceRow, page, pulled, score2 } from '../data'

const c3 = confidenceRow(3)
const ackman = agent('ackman')
// The build checks this is a low-rated win that scores worse than a loss would have.
const example = ackman.sampleBets.find((b) => b.slot === 'rated 7 or lower, won')!
const exampleSidePercent = Math.round(100 * (example.side === 'YES' ? example.marketProbAtEntry : 1 - example.marketProbAtEntry))
const exampleLoss = confidenceRow(example.confidence).asScored.loss
const simons = agent('simons')
const simonsDrop = simons.rankFixed - simons.rankAsScored
const low = page.line.lowThreshold
const high = page.line.bands[1]
const { proof, king, quotes } = page

export function Walkthrough() {
  return (
    <>
      <main className="walkthrough">
        <div className="wrap">
          <header className="intro prose">
            <h1>Agent Street Season 1, rescored</h1>
            <p className="lede">
              I'm applying to your Collective Intelligence project on Riipen. Before writing to you, I went through Agent
              Street's public Season 1 data and found one line in the scoring that reorders your trust ranking. This is
              that check, on your own numbers.
            </p>
            <div className="actions">
              <a className="button primary" href="/season-1">
                Open the rescore
              </a>
              <a className="button quiet" href={REPO}>
                See the code
              </a>
            </div>
          </header>

          <div className="prose">
            <p>
              Your <a href={quotes.proofOfTrust.page}>Proof of Trust</a> essay says trust "is a per-domain measurement of
              track record." On Agent Street, trust comes from Brier scores. I rebuilt all {proof.agents} published scores
              from your public API. They match to 3 decimals when a 1 to 15 confidence rating is read as the chance the
              agent's own side is right, so a {example.confidence} becomes {confidenceRow(example.confidence).asScored.percent}%.
            </p>
            <p>
              That reading rewards losing. The Ackman agent bet {example.side} on "{example.question}" and rated it{' '}
              {example.confidence}, with the market at {exampleSidePercent}% on {example.side}. It was right, and the win
              scored {brier3(example.scoreAsScored)}. A loss would have scored {brier3(exampleLoss)}. Lower is better, and a
              coin flip scores {page.line.coinFlipBrier}. Across its {ackman.n} settled bets, it rates {ackman.lowCount} at{' '}
              {low} or lower, wins {ackman.winPercent}% of all {ackman.n}, and still scores worse than a coin flip.
            </p>
            <p>
              Reading 1 as "barely better than a coin flip" and 15 as "certain" stops that in one line, and the page shows
              what moves when you do. It's a stopgap, though. Under either reading the rating isn't a probability: bets rated{' '}
              {high.from} or higher won {high.wonPercent}%, about what the market priced them at. So the page also asks which
              agents beat the market price. In Season 1, none clearly does yet. It's the test I'd use for the question you
              asked <a href={SUPERFORECASTER_POST.url}>on {SUPERFORECASTER_POST.date}</a>, "{SUPERFORECASTER_POST.text}"
            </p>
          </div>

          <div className="try">
            <section className="try-text" aria-labelledby="try-h">
              <h2 id="try-h">Try this first</h2>
              <ol className="steps">
                <li>
                  <a href="/season-1#line">Drag the confidence slider.</a> At {low} and below, losing scores better than
                  winning.
                </li>
                <li>
                  <a href="/season-1#scorecard">Switch the ranking</a> from "As scored" to "Fixed". The Simons agent drops{' '}
                  {simonsDrop} places.
                </li>
                <li>
                  <a href="/season-1#market">Compare each agent with the market price.</a> Every one is inside the range luck
                  alone explains.
                </li>
                <li>
                  <a href="/season-1#proof">Open "Show the 10"</a> at the top. That's the test rebuilding your published
                  scores before it changes anything.
                </li>
              </ol>
            </section>
            <div className="shots">
              <a href="/season-1#line" className="shot">
                <img
                  src="/shots/slider.png"
                  width={433}
                  height={510}
                  alt={`The confidence slider set to 3: as scored, a win scores ${score2(c3.asScored.win)} and a loss ${score2(c3.asScored.loss)}; fixed, a win scores ${score2(c3.fixed.win)} and a loss ${score2(c3.fixed.loss)}.`}
                />
                <span>The slider</span>
              </a>
            </div>

            <section className="yours" aria-labelledby="yours-h">
            <h2 id="yours-h">What's yours and what's mine</h2>
            <ul>
              <li>
                <b>Yours:</b> every pick, outcome, market price at entry and published score, pulled from
                street.lucatheory.com's public API on {pulled}. Play money, Season 1.
              </li>
              <li>
                <b>Yours:</b> the trust formula from your methodology page, and the King's consensus formula. My replay
                matches the King's consensus on all {king.consensusMatches} bets that list each agent's vote.
              </li>
              <li>
                <b>Mine:</b> the fixed reading of confidence, the comparison with the market price, how domain cells
                get blended, and the proposed API response. They're proposals to argue with.
              </li>
              <li>
                I only had the public site. I can't tell from outside whether this reading was a deliberate choice, so take
                this as a question as much as a fix.
              </li>
            </ul>
            </section>
          </div>

          <section className="prose about" aria-label="About me">
            <p>
              I'm {OWNER.name}, a Computer Engineering student at TMU. This summer I finished a Level UP project
              with BESI: an AI hiring-assessment prototype where every quote the model cites is checked against the
              candidate's own answers, and no model output can set a score.
            </p>
            <p className="links">
              <a href={OWNER.github}>GitHub</a>
              <a href={OWNER.linkedin}>LinkedIn</a>
              <a href={`mailto:${OWNER.email}`}>Email</a>
            </p>
          </section>
        </div>
      </main>
      <Footer>
        Not affiliated with or endorsed by LUCA Theory. Play-money data from your public site. If you'd rather this page
        not be public, <a href={`mailto:${OWNER.email}`}>tell me</a> and I'll take it down.
      </Footer>
    </>
  )
}
