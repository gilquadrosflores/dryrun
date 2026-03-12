# Dryrun Pitch Deck Outline — Synthetic User Testing Platform

> **Format:** Guy Kawasaki 10-slide structure. One idea per slide. 30pt font minimum. 20-minute pitch.
> 

---

# Slide 1 - Title

**Headline:** Dryrun

**Subline:** AI agents that test your product like real users - in hours, not weeks.

**Bottom:** [Your name] · [Email] · [Website]

---

# Slide 2 - The Problem

**Headline:** Engineering got 10x faster. Product teams didn't.

**Bullets:**

- Agentic coding tools (Claude Code, Codex, Cursor, Replit Agent) have collapsed the build cycle from weeks to hours. Shipping code is no longer the bottleneck.
- The new bottleneck is product work: deciding *what* to build, validating UX, understanding where users get stuck. PMs and designers can't keep up with the speed of code.
- Traditional user testing doesn't fit this pace. Recruiting 5 users, scheduling sessions, and synthesizing results takes 4-6 weeks and $12K-$18K per study *(Mediabarn Research)*.
- Result: teams are vibecoding at 10x speed but shipping with blind spots they've never tested. The feedback loop is broken.

**What to nail:** The investor should feel the asymmetry. The engineering side of product development got an AI revolution. The product insight side is still stuck in 2019. That's the gap.

---

# Slide 3 - Why Now

**Headline:** Three things converged to make this possible.

**Bullets:**

- **Browser agents hit production quality.** Anthropic's Computer Use API, Browserbase, and Stagehand now let AI agents reliably navigate real web applications - clicking, typing, scrolling, waiting. This wasn't possible 18 months ago.
- **The UX research gap is widening.** Researcher layoffs + accelerating ship velocity = more products launching with less user insight than ever. The demand for fast, cheap testing is structural, not cyclical.
- **Vibecoding changed the economics.** When you can build a feature in 2 hours, spending $15K and 6 weeks to test it makes zero sense. The speed of creation demands a matching speed of validation.

**What to nail:** Each of these alone is interesting. Together, they create a market that didn't exist two years ago. The investor should leave this slide thinking "the timing is perfect."

---

# Slide 4 - The Solution

**Headline:** Give us a URL. We run your users for you.

**How it works:**

1. Enter your product URL and describe your target users
2. We generate realistic behavioral personas grounded in real usage patterns
3. AI browser agents run your product like actual users - clicking, hesitating, getting confused, abandoning
4. You receive a friction report within hours: what broke, where users got stuck, and why they'd churn

**Key proof point:** We built this first on CoGrader (AI grading platform, 200K+ students). Our synthetic teacher agents surfaced critical friction in the onboarding flow in under 3 hours. A human study would have taken 4 weeks and $15K.

**What to nail:** Show a screenshot or 30-second screen recording of an agent session in action. Investors remember what they see. The demo should feel eerily human - not like a QA bot clicking through a checklist.

---

# Slide 5 - The Underlying Magic

**Headline:** This isn't a chatbot simulation. The agent actually uses your product.

**Two things that matter:**

- **Behavioral persona engine.** Not narrative bios - structured behavioral fields: patience budget, trust threshold, abandonment triggers, distraction level. Grounded in real user interviews and session recordings. The agent acts like Linda, the teacher with 178 students and 22 minutes before prep period - not like a QA script.
- **Dual execution modes.** Quick Mode runs DOM-based sessions in 5-15 minutes for cents per run. Advanced Mode uses OS-level computer vision for canvas apps, PDFs, and cross-origin iframes. Fast and cheap for iteration, deep and thorough when you need it.

**Stack:** Browserbase + Stagehand + Claude Sonnet (Anthropic Computer Use API).

**What to nail:** Two ideas max on this slide. The investor needs to understand this is non-trivial and that you understand behavioral realism better than anyone. Everything else goes in the appendix.

---

# Slide 6 - The Business Model

**Headline:** SaaS subscription with usage-based expansion.

**Tiers:**

- **Starter** - $99/month: 1 product, 1 persona, 3 runs/month. For founders and solo PMs.
- **Growth** - $499/month: up to 5 products, all personas, 20 runs/month, cohort reports.
- **Enterprise** - $2,000+/month: unlimited runs, Advanced Mode, custom personas, dedicated onboarding.

**Path to $50K MRR (Month 12 target):**

| Tier | Customers | MRR each | MRR total |
| --- | --- | --- | --- |
| Starter | 100 | $99 | $9,900 |
| Growth | 50 | $499 | $24,950 |
| Enterprise | 8 | $2,000 | $16,000 |
| **Total** | **158** |  | **$50,850** |

**Unit economics (target):**

- Starter CAC: under $50 via PLG. Payback: under 1 month.
- Growth CAC: under $300 via content + outbound. Payback: under 1 month.
- Enterprise ACV: $24K-$48K. Sold direct.

**What to nail:** The comparison that lands: "We charge $499/month for a product team that currently spends $15K per study and waits 6 weeks." Show the mix math. Investors will do napkin math - make sure it adds up.

---

# Slide 7 - Go-To-Market

**Headline:** Land with seed-stage product teams. Expand to mid-market SaaS.

**Phase 1 - The wedge:**

- Target: product teams at B2B SaaS startups with 10-50 people and no dedicated UX researcher
- Sub-vertical entry: EdTech (working integration with CoGrader) and developer tools
- Why them: they vibecode fast, they care about activation, and they have no $15K budget for a study

**Channel 1 - Content flywheel (primary):**

- Publish "Synthetic vs. Real" comparison reports - AI run vs. real user session on the same product
- This is content only we can make. High-signal for PMs and founders. Becomes the inbound magnet.
- Target: 2 comparison reports/month. Each one is a lead gen asset and a proof point.

**Channel 2 - PLG:**

- Free tier: 1 product, 1 persona, 1 run. No credit card.
- Upgrade trigger: you want more personas, more runs, or cohort comparison

**Channel 3 - Outbound (supporting):**

- Target PMs at seed and Series A startups who currently use Hotjar + gut instinct
- 500 outbound touches/month at launch via Clay + LinkedIn

**What to nail:** Lead with the thing only you can do (the comparison reports). Show that you know who your first 20 customers are by name and how you'll reach them.

---

# Slide 8 - Competition

**Headline:** We're not QA. We're not interviews. We're behavioral simulation on the live product.

| Competitor | What they do | The gap |
| --- | --- | --- |
| **UserTesting** | Real human sessions | $25-30K per study, 4-6 weeks. Can't run weekly. Won't add AI agents - their business model depends on human panels. |
| [**SyntheticUsers.com**](http://SyntheticUsers.com) | AI persona interviews (text-based) | Simulates a conversation, not actual product usage. No browser agent. |
| **Octomind / Magnitude** | AI test generation for QA/CI | Verifies code works, not that humans understand it. Different buyer (engineering, not product). |
| **Maze / Lyssna** | Lightweight unmoderated testing | Requires real participant recruitment, $45/session. Still too slow for vibecoding pace. |
| **Hotjar + Fullstory** | Session replay and heatmaps | Shows *what* happened, not *why*. Only works on real traffic - useless for pre-launch or low-traffic features. |

**The "why won't they just add this?" answer:** Incumbents optimize for their existing business model. UserTesting monetizes human panels. Hotjar monetizes existing traffic. Building behaviorally realistic AI agents that navigate live products is a fundamentally different technical competency - not a feature bolt-on.

**Our position:** The only tool that runs your actual product - not a prototype or a chat simulation - with behaviorally realistic AI agents, in hours, for dollars per session.

**What to nail:** Don't say "we have no competition." Own the comparison. Show where you win clearly. Address the "why won't X just add this" question before they ask it.

---

# Slide 9 - The Team

**Headline:** We're building this because we needed it.

**What to establish:**

- Founder background: [your actual background: product, AI, EdTech]
- Founder-market fit: CoGrader is our first customer. We built this to solve our own activation problem. We have 200K+ students on platform and needed to understand why teachers drop off in week 1.
- We have a working prototype on a live product, a real comparison dataset (synthetic vs. real teacher sessions), and a clear baseline.
- [Add any advisors, angels, or relevant prior company experience]

**What to nail:** Investors bet on people first. Show that this team understands this problem better than anyone who could try to build it. The CoGrader origin story is the credibility anchor - you didn't theorize this problem, you lived it.

---

# Slide 10 - Traction and Milestones

**Headline:** Working system. First real data. One external validation.

**Current state:**

- Full pipeline validated end-to-end on CoGrader: persona generation to task plan to browser agent to friction report
- 6 behavioral personas built and tested
- Quick Mode (DOM-based) and Advanced Mode (OS-level) both operational
- Friction report format validated against real teacher session data
- [GOAL: Run at least 1 session on an external product before pitching. Even one outside validation transforms credibility.]

**12-month milestones:**

- Month 1-2: Launch Starter plan publicly. Acquire first 20 paying teams.
- Month 3-4: Ship cohort comparison reports. Publish first 3 "Synthetic vs. Real" reports. Begin EdTech and devtool vertical expansion.
- Month 5-6: Launch Enterprise tier. First 3 direct enterprise contracts.
- Month 7-12: $50K MRR, 158 active teams, Series A prep.

**What to nail:** Be honest. Credible traction at an early stage beats inflated numbers every time. But get that one external proof point before you pitch - it's the difference between "we built a thing" and "this works."

---

# Slide 11 - The Ask

**Headline:** We're raising $1.5M to get to $50K MRR.

**Round:** $1.5M pre-seed on a SAFE, $8M post-money cap, MFN.

**Use of funds:**

- **50% Engineering ($750K)** - Full-stack hire, browser infra at scale, Advanced Mode hardening
- **25% GTM ($375K)** - Content program (comparison reports), outbound tooling (Clay + LinkedIn), first sales hire at Month 6
- **25% Infrastructure ($375K)** - Browserbase, Anthropic API costs at scale, session storage

**This gets us to:**

- 158 paying teams by Month 12
- $50K MRR ($600K ARR)
- Enough enterprise signal to raise a $5-7M seed at a meaningful step-up

**What to nail:** Every dollar should map to a milestone. "We will use it for growth" is not an answer. The MRR target needs to justify the next round's valuation step-up.

---

# Kawasaki's Rules (reference)

- 10 slides maximum. Everything else is backup. (We have 11 - consider merging Why Now into Problem, or cutting to appendix if time is tight.)
- 20 minutes maximum. Leave 40 for questions.
- 30pt font minimum. If it fits, you're saying too much.
- The deck is the backdrop. You should be able to give this talk without it.

---