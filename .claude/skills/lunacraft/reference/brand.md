# Brand register

When design IS the product: brand sites, landing pages, marketing surfaces, campaign pages, portfolios, long-form content, about pages. The deliverable is the design itself; a visitor's impression is the thing being made.

The register spans every genre. A tech brand (Stripe, Linear, Vercel). A luxury brand (a hotel, a fashion house). A consumer product (a restaurant, a travel site, a CPG packaging page). A creative studio, an agency portfolio, a band's album page. They all share the stance (*communicate, not transact*) and diverge wildly in aesthetic. Don't collapse them into a single look.

## The brand slop test

If someone could look at this and say "AI made that" without hesitation, it's failed. The bar is distinctiveness; a visitor should ask "how was this made?", not "which AI made this?"

Brand isn't a neutral register. AI-generated landing pages have flooded the internet, and average is no longer findable. Restraint without intent now reads as mediocre, not refined. Brand surfaces need a POV, a specific audience, a willingness to risk strangeness. Go big or go home.

**The second slop test: aesthetic lane.** Before committing to moves, name the reference. A Klim-style specimen page is one lane; Stripe-minimal is another; Liquid-Death-acid-maximalism is another. Don't drift into editorial-magazine aesthetics on a brief that isn't editorial. A hiking brand with Cormorant italic drop caps has the wrong register within the register.

Then the inverse test: in one sentence, describe what you're about to build the way a competitor would describe theirs. If that sentence fits the modal landing page in the category, restart.

## Decision-style scene (audience fit, brand expression)

The brand-register expression of SKILL.md § Audience fit. Before designing, write one concrete line about how this demographic **evaluates and decides**: what they need to see, feel, or verify before they act, and in what order. "A homeowner with a flooded basement comparing three dumpster companies on her phone at 7am" decides on price-clarity, proof of reliability, and a tappable phone number — direct, front-loaded, zero atmosphere. "A couple shortlisting wedding venues on a Sunday evening" decides on atmosphere first and logistics second — imagery and tone before numbers. The scene dictates the page's information ORDER and pace, not just its skin.

- Function follows the decision: what they verify first goes highest; what closes the decision (call, book, buy) is the loudest element; what they don't care about gets cut, not shrunk.
- Look follows the decision style: direct deciders get density, numbers, and plain speech; experiential deciders get room, imagery, and voice. Never assign aesthetics by demographic stereotype — derive from how the decision actually happens and say why.
- If the brief doesn't say who decides or how, ask before designing. A landing page for an unwritten audience is a template.

## Typography

### Font selection procedure

Every project. Never skip.

1. Read the brief. Write three concrete brand-voice words. Not "modern" or "elegant," but "warm and mechanical and opinionated" or "calm and clinical and careful." Physical-object words.
2. List the three fonts you'd reach for by reflex. If any appear in the reflex-reject list below, reject them; they are training-data defaults and they create monoculture.
3. Start with the curated catalog in [fonts.md](fonts.md) — it covers 80+ fonts across Google Fonts and Fontshare, organized by role and industry. Filter out `[BR]`-tagged fonts (they're on this list for a reason). If nothing fits, browse external catalogs (Pangram Pangram, Future Fonts, Adobe Fonts, ABC Dinamo, Klim, Velvetyne) with the three words in mind. Find the font for the brand as a *physical object*: a museum caption, a 1970s terminal manual, a fabric label, a cheap-newsprint children's book, a concert poster, a receipt from a mid-century diner. Reject the first thing that "looks designy."
4. Cross-check. "Elegant" is not necessarily serif. "Technical" is not necessarily sans. "Warm" is not Fraunces. If the final pick lines up with the original reflex, start over.

### Reflex-reject list

Training-data defaults. Ban list. Look further:

Fraunces · Newsreader · Lora · Crimson · Crimson Pro · Crimson Text · Playfair Display · Cormorant · Cormorant Garamond · Recoleta · Syne · IBM Plex Mono · IBM Plex Sans · IBM Plex Serif · Space Mono · Space Grotesk · Inter · Geist · Mona Sans · Roboto · DM Sans · DM Serif Display · DM Serif Text · Outfit · Plus Jakarta Sans · Instrument Sans · Instrument Serif

### Reflex-reject aesthetic lanes

Parallel to the font list. Currently saturated aesthetic families that have flooded brand surfaces. If a brief lands in one of these lanes without a register reason that *requires* it (a literal magazine, a literal terminal, a literal industrial signage system), it's the second-order training reflex: the trap one tier deeper than picking a Fraunces font. Look further.

- **Editorial-typographic.** Display serif (often italic) + small mono labels + ruled separators + monochromatic restraint. Klim-influenced, magazine-cover affectation. By 2026, every Stripe-adjacent and Notion-adjacent brand has landed here. The fingerprint: three rule-separated columns, an italic Fraunces / Recoleta / Newsreader headline, lowercase track-spaced metadata, no imagery.
- **Warm-cream artisan.** (added 2026-07-03) Warm off-white ground near #F4F1EA + high-contrast serif display + terracotta/clay accent. The single most common AI-generated landing page look; it reads "trustworthy local business" by reflex, which is exactly why every AI-built local-business site now has it. The fingerprint: cream sections, one deep green or brown ink, serif headlines, orange-brown buttons. Legitimate only when the brief demands it by name.
- **Acid-accent dark.** Near-black surface + one acid-green or vermilion pop. AI-default look for anything "techy" or "bold." Needs a register reason.
- **Broadsheet-hairline.** Hairline rules, zero border-radius, dense newspaper columns. Default #3; a literal publication may earn it.

(More entries land here on the same cadence the font list updates. Brutalist-utility and acid-maximalism may join when they saturate. Removing entries when they fall back below saturation is also fine.)

The reflex-reject lists apply to **new design choices**. When the existing brand has already committed to a font or a lane as part of its identity, identity-preservation wins; variants on an existing surface don't second-guess what's already shipping. The reflex-reject lists are for greenfield decisions and for departure-mode variants in [live.md](live.md).

### Pairing and voice

Distinctive + refined is the goal. The specific shape depends on the brand:

- **Editorial / long-form / luxury**: display serif + sans body (a magazine shape).
- **Tech / dev tools / fintech**: one committed sans, usually; custom-tight tracking, strong weight contrast inside a single family.
- **Consumer / food / travel**: warmer pairings, often a humanist sans plus a script or display serif.
- **Creative studios / agencies**: rule-breaking welcome. Mono-only, or display-only, or custom-drawn type as voice.

Two families minimum is the rule *only* when the voice needs it. A single well-chosen family with committed weight/size contrast is stronger than a timid display+body pair.

Vary across projects. If the last brief was a serif-display landing page, this one isn't.

### Scale

Modular scale, fluid `clamp()` for headings, ≥1.25 ratio between steps. Flat scales (1.1× apart) read as uncommitted.

Light text on dark backgrounds: add 0.05–0.1 to line-height. Light type reads as lighter weight and needs more breathing room.

## Color

Brand surfaces have permission for Committed, Full palette, and Drenched strategies. Use them. A single saturated color spread across a hero is not excess; it's voice. A beige-and-muted-slate landing page ignores the register.

- Name a real reference before picking a strategy. "Klim Type Foundry #ff4500 orange drench", "Stripe purple-on-white restraint", "Liquid Death acid-green full palette", "Mailchimp yellow full palette", "Condé Nast Traveler muted navy restraint", "Vercel pure black monochrome". Unnamed ambition becomes beige.
- Palette IS voice. A calm brand and a restless brand should not share palette mechanics.
- When the strategy is Committed or Drenched, color carries the brand. Don't hedge with neutrals around the edges. Commit.
- Don't converge across projects. If the last brand surface was restrained-on-cream, this one is not.
- When a cultural-symbol palette is the obvious pull, reach past it. Let the cultural reading come from typography, imagery, and copy, not the palette.

## Layout

- Asymmetric compositions are one option. Break the grid intentionally for emphasis.
- Fluid spacing with `clamp()` that breathes on larger viewports. Vary for rhythm: generous separations, tight groupings.
- Alternative: a strict, visible grid as the voice (brutalist / Swiss / tech-spec aesthetics). Either asymmetric or rigorously-gridded can be "designed"; the failure mode is splitting the difference into a generic centered stack.
- Don't default to centering everything. Left-aligned with asymmetric layouts feels more designed; a strict grid reads as confident structure. A centered-stack hero with icon-title-subtitle cards reads as template.
- When cards ARE the right affordance, use `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` for breakpoint-free responsiveness.

## Background Modes

Every brand section sits on a background, and the background is a design decision, not a default. Name the treatment before building.

- **Solid**: Single committed color — the Drenched strategy. The color IS the section. Works when the brand color is strong enough to carry a full viewport.
- **Split-Tone**: Two-color horizontal or diagonal split. Each half can carry different content types. Creates instant visual energy without imagery.
- **Full-Bleed Photography**: Edge-to-edge image with text overlay. The photo IS the section. Requires careful contrast management for text readability (overlay gradient or text-shadow).
- **Duotone Image**: Two-color processed photography. Maps the image's tonal range to two brand colors for brand-consistent visual impact from any source photo.
- **Diptych**: Two distinct panels side by side, often with contrasting backgrounds. Creates comparison, tension, or narrative progression.
- **Gradient Field**: Multi-stop intentional gradient. NOT purple-to-blue. Named reference gradients like "Stripe warm sunset" or "Linear cool slate." The gradient tells a temperature story.
- **Textured**: Grain, noise, or pattern overlay on a color field. Adds analog depth to digital surfaces. See bolder.md's Noise/Grain pattern for implementation.
- **Video / Motion Background**: Looping ambient video. Autoplay, muted, `playsinline`. Keep under 10 seconds, compress aggressively. The motion should be atmospheric, not narrative.
- **Geometric Pattern**: Repeating shapes or lines as texture. SVG patterns, CSS `repeating-linear-gradient`, or generated patterns. Subtle enough to read as texture, not wallpaper.
- **Dark-on-Dark**: Near-black surface with subtle tonal shifts between sections. The contrast comes from elevation, not hue. Works for tech, luxury, and editorial registers.

Vary background modes across sections. A page that uses Solid for every section has no visual rhythm regardless of content.

## Narrative Concepts

Every multi-section brand page tells a story, whether the builder names it or not. Unnamed stories meander.

- **Narrative Spine**: Name the story shape before building. Common spines: Artifact (the product as a crafted object), Journey (user transformation from before to after), Tool (capability unlocked), Garden (growing ecosystem), Stage (showcase for creative work), Archive (curated collection). Each section advances the narrative; sections without a role in the story are padding. Cut them or give them a role.
- **Second-Read Moment**: One deliberate, non-obvious motif per page that rewards closer inspection. A hidden hover interaction, a background detail that echoes the brand mark, a typographic easter egg in the footer, an animation that only fires once. The moment should be discoverable but not essential — a gift for the attentive visitor, not a requirement for comprehension.

## Imagery

Brand surfaces lean on imagery. A restaurant, hotel, magazine, or product landing page without any imagery reads as incomplete, not as restrained. A solid-color rectangle where a hero image should go is worse than a representative stock photo.

**When the brief implies imagery (restaurants, hotels, magazines, photography, hobbyist communities, food, travel, fashion, product), you must ship imagery.** Zero images is a bug, not a design choice. "Restraint" is not an excuse. If the approved comp or brief is image-led, ship real project assets, generated raster assets, or a credible canvas/SVG/WebGL scene. Do not replace photographic, architectural, product, or place imagery with generic CSS panels, decorative diagrams, cards, bullets, or copy.

- **For greenfield work without local assets, use stock imagery.** Unsplash is the default. The URL shape is `https://images.unsplash.com/photo-{id}?auto=format&fit=crop&w=1600&q=80`. **Verify the URLs before referencing them.** If you have an image-search MCP, web-fetch tool, or browser access, use it to find real photo IDs and confirm they resolve. Guessed IDs (even ones that look real) often 404 and ship as broken-image placeholders. Without a verification path, pick fewer photos you're confident exist over more that you guessed; never substitute colored `<div>` placeholders.
- **Search for the brand's physical object**, not the generic category: "handmade pasta on a scratched wooden table" beats "Italian food"; "cypress trees above a limestone hotel facade at dusk" beats "luxury hotel".
- **One decisive photo beats five mediocre ones.** Hero imagery should commit to a mood; padding with more stock doesn't rescue an indecisive one.
- **Alt text is part of the voice.** "Coastal fettuccine, hand-cut, served on the terrace" beats "pasta dish".

"Imagery" here is broader than stock photography: product screenshots, custom data visualizations, generated SVG, and canvas/WebGL scenes are all imagery. Text-only pages where typography alone carries the entire visual weight are the failure mode.

## Motion

- One well-orchestrated page-load with staggered reveals beats scattered micro-interactions, when the brand invites it. Tech-minimal brands often skip entrance motion entirely; the restraint is the voice.
- For collapsing/expanding sections, transition `grid-template-rows` rather than `height`.

## Brand bans (on top of the shared absolute bans)

- Monospace as lazy shorthand for "technical / developer." If the brand isn't technical, mono reads as costume.
- Large rounded-corner icons above every heading. Screams template.
- Single-family pages that picked the family by reflex, not voice. (A single family chosen deliberately is fine.)
- All-caps body copy. Reserve caps for short labels and headings.
- Timid palettes and average layouts. Safe = invisible.
- Zero imagery on a brief that implies imagery (restaurant, hotel, food, travel, fashion, photography, hobbyist). Colored blocks where a hero photo belongs.
- Defaulting to editorial-magazine aesthetics (display serif + italic + drop caps + broadsheet grid) on briefs that aren't magazine-shaped. Editorial is ONE aesthetic lane, not the default brand aesthetic.
- Repeated tiny uppercase tracked labels above every section heading. A single strong kicker can be voice; repeating it as section grammar is AI scaffolding unless it's a deliberate, named brand system.

## Brand permissions

Brand can afford things product can't. Take them.

- Ambitious first-load motion. Reveals, scroll-triggered transitions, typographic choreography.
- Single-purpose viewports. One dominant idea per fold, long scroll, deliberate pacing.
- Typographic risk. Enormous display type, unexpected italic cuts, mixed cases, hand-drawn headlines, a single oversize word as a hero.
- Unexpected color strategies. Palette IS voice; a calm brand and a restless brand should not share palette mechanics.
- Art direction per section. Different sections can have different visual worlds if the narrative demands it. Consistency of voice beats consistency of treatment.

