import { Footer } from '../components/Footer'
import { OWNER, REPO, agent, confidenceRow, ordinal, page, pulled, score2 } from '../data'

const c3 = confidenceRow(3)
const ackman = agent('ackman')
const simons = agent('simons')
const simonsDrop = simons.rankFixed - simons.rankAsScored
const low = page.line.lowThreshold
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
              Street's public Season 1 data and found one line in the scoring that changes who looks like your best
              forecaster. This is that check, on your own numbers.
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
              agent's own side is right, so a 3 becomes {c3.asScored.percent}%.
            </p>
            <p>
              That reading rewards losing. A pick rated 3 scores {score2(c3.asScored.win)} if it wins and{' '}
              {score2(c3.asScored.loss)} if it loses. It's why the Ackman agent wins {ackman.winPercent}% of its settled
              bets and still scores worse than a coin flip, while the Simons agent wins {simons.winPercent}% and has the{' '}
              {ordinal(simons.rankAsScored)}-highest trust.
            </p>
            <p>
              Reading 1 as "barely better than a coin flip" and 15 as "certain" fixes it in one line. The page shows what
              moves when you do.
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
                  <a href="/season-1#domains">Tap the SBF agent's geopolitics cell</a>, then the Wood agent's crypto cell.
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
                  width={452}
                  height={420}
                  alt="The confidence slider set to 3: as scored, a win scores 0.64 and a loss 0.04; fixed, a win scores 0.16 and a loss 0.36."
                />
                <span>The slider</span>
              </a>
              <a href="/season-1#domains" className="shot">
                <img
                  src="/shots/grid.png"
                  width={456}
                  height={438}
                  alt="The by-domain grid: agents by five domains, colored by fixed Brier score, with thin cells hatched."
                />
                <span>The domain grid</span>
              </a>
            </div>

            <section className="yours" aria-labelledby="yours-h">
            <h2 id="yours-h">What's yours and what's mine</h2>
            <ul>
              <li>
                <b>Yours:</b> every pick, outcome and published score, pulled from street.lucatheory.com's public API on{' '}
                {pulled}. Play money, Season 1.
              </li>
              <li>
                <b>Yours:</b> the trust formula from your methodology page, and the King's consensus formula. My replay
                matches the King's consensus on all {king.consensusMatches} bets that list each agent's vote.
              </li>
              <li>
                <b>Mine:</b> the fixed reading of confidence, how thin domain cells get blended, and the proposed API
                response. They're proposals to argue with.
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
              I'm {OWNER.name}, a 4th-year Computer Engineering student at TMU. This summer I finished a Level UP project
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
