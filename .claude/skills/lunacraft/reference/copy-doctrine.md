# Copy Doctrine

Shared copy quality standards for LunaCraft and the `copy` skill.

## Ownership Boundary

- `copy` owns marketing and page copy: homepage, landing pages, pricing pages, feature pages, about pages, CTAs, value propositions, rewrites, proofreading, and copy sweeps.
- LunaCraft owns interface microcopy when it is part of UX design: button labels, form labels, error messages, empty states, loading states, navigation labels, confirmation text, and inline helper text.
- If a LunaCraft task needs substantial page or marketing copy, use the `copy` skill or ask for supplied copy before designing around it.
- If a copy task becomes visual layout, component implementation, or interaction design, route that work to LunaCraft.

## Universal Standards

- Every word earns its place. No restated headings, no intros that repeat the title, no filler setup.
- No em dashes. Use commas, colons, semicolons, periods, or parentheses.
- No interpunct separator dots (`·`) in UI text or copy (owner rule, 2026-07-04, alerts mock round). Metadata strings chained with dots read as template filler. Use colons for kind-to-entity pairs, commas within a clause, or split onto a sub-line; counts and qualifiers become their own styled elements, never a dot-chained tail.
- Use clear, specific, human language. Prefer concrete nouns and verbs over vague adjectives.
- Do not fabricate proof, metrics, testimonials, capabilities, pricing, or guarantees. If proof is missing, use a placeholder or soften the claim.
- Avoid corporate filler: leverage, seamless, innovative, robust, cutting-edge, best-in-class, solution, unlock, transform, elevate, empower, revolutionize.
- Avoid AI tells: "In today's landscape", "At its core", "It's worth noting", "Let's delve into", "When it comes to", "That being said".

## Hero Copy Discipline

Reject category-template hero copy:

- "Your trusted partner for..."
- "Your one-stop solution for..."
- "The leading provider of..."
- "Transform your [category] with..."
- "Experience the difference..."
- "Built for modern teams..."

Better hero copy is specific, concrete, and action-oriented:

- Names the audience or job.
- States the useful outcome.
- Carries a real constraint, time, place, proof point, or differentiator.
- Avoids generic category nouns as the whole sentence.

## CTA Standards

- Use verb plus object: "Book a dumpster", "See local pricing", "Create account", "Save changes".
- Avoid vague CTAs: Submit, Learn More, Get Started, Click Here, OK, Yes, No.
- Match the user's mental model. A checkout CTA should name the next step; a destructive CTA should name the destructive action.
- Do not hide risk. If the next step charges, deletes, submits, or publishes, say so.

## Anti-Slop Checks

Before finalizing copy, ask:

- Could this fit any company in the category with no edits?
- Is the headline just a dressed-up category label?
- Does the subhead repeat the headline instead of adding information?
- Are sections padded with transition phrases instead of new value?
- Are CTAs interchangeable across the site?
- Does the voice sound like a brand, or like a generic AI landing page?

If any answer is yes, rewrite before shipping.

## Design Fit

Copy must support the visual hierarchy:

- Headlines carry the main idea.
- Subheads add specificity, not repetition.
- Body copy answers objections or explains the decision.
- CTA copy makes the next action obvious.
- Microcopy reduces uncertainty at the moment of action.

Good copy makes the interface easier to scan. It does not ask the layout to rescue vague messaging.

### No footnote microcopy (user rule, 2026-07-01)

Do NOT attach small-print annotations to UI elements: no hint text beside or under labels, no "these become X" explainers, no "add anything that applies in Y" pointers, no reassurance sentences appended after lists or buttons. The user has rejected these repeatedly. Convey constraints through label wording, the field placeholder, or validation at the moment of error, and let structure (badges, headings, status text) carry the explanation. Helper/footnote text is opt-in only: add it when the user explicitly asks. This overrides "contextual help / inline hints" credit in heuristics-scoring.md and the reassurance-copy check in critique.md.

## SEO placement boundary

SEO keyword placement does not override hero discipline, proof rules, CTA standards, or anti-slop checks in this file.

- Primary keywords belong in title, meta, and H1 when natural; never at the cost of category-template hero copy.
- Section-level secondaries must read as human copy, not repeated exact-match stuffing.
- Map targets live in `SEO-KEYWORDS.md`; strategic principles live in `PROJECT-BRIEF.md`.
- For workflow order and sweep 0, read `~/.claude/skills/copy/references/seo-copy.md`.
