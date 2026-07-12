Curated font catalog for LunaCraft. Consult during font selection in [typeset.md](typeset.md) or when [brand.md](brand.md)'s font selection procedure runs.

---

## Sources and Loading

**Google Fonts** (default):
```html
<link href="https://fonts.googleapis.com/css2?family=Font+Name:wght@400;600;700&display=swap" rel="stylesheet">
```

**Fontshare** (Indian Type Foundry, free commercial use):
```html
<link href="https://api.fontshare.com/v2/css?f[]=font-name@400,700&display=swap" rel="stylesheet">
```

**Self-hosted** (GitHub fonts, custom downloads): download WOFF2, define `@font-face` in CSS.

Load only the weights you use. Each unused weight is wasted bandwidth.

---

## Fonts by Role

Fonts tagged `[BR]` are on `brand.md`'s reflex-reject list. See the Brand Register Note at the bottom.

### Display — Bold Sans

Condensed, high-impact, all-caps-friendly.

| Font | Source | Character | Best For |
|---|---|---|---|
| Bebas Neue | Google | Cinematic, tall, clean | Posters, hero text, film/media |
| Teko | Google | Square, industrial, edgy | Construction, trades, sports |
| Barlow Condensed | Google | Tech-forward, Californian | Tech, automotive, modern services |
| Fjalla One | Google | Bold, friendly condensed | Headlines needing strength without aggression |
| Archivo Black | Google | Heavy, blunt, grounded | One-line impact statements |
| Oswald | Google | Geometric, versatile condensed | General-purpose bold headlines |
| Saira Condensed | Google | Tactical, dense, wide weight range | Military, tactical, fitness |
| League Spartan | Google | Bold geometric, classic | Strong brand statements |
| Secular One | Google | Blocky, confident, modern | Tech, startup, bold brands |
| Archivo Narrow | Google | Compact, efficient | Space-constrained headlines |
| Pathway Gothic One | Google | Ultra-condensed, dramatic | Tall narrow headlines, posters |
| Clash Display | Fontshare | Ultra-tight apertures, bold, editorial | Display headlines, brand identity |
| Tanker | Fontshare | Ultra-bold, compressed | Poster-level impact, single words |

### Display — Personality Sans

Distinctive, not condensed. Character-driven.

| Font | Source | Character | Best For |
|---|---|---|---|
| Bricolage Grotesque | Google | Quirky, editorial, warm | Creative brands, agencies |
| Familjen Grotesk | Google | Quirky, personality-driven | Subheadings, kickers with character |
| Syne `[BR]` | Google | Geometric, artistic | Creative studios, art, culture |
| Epilogue | Google | Modern, slightly condensed | Contemporary brands, startups |
| Outfit `[BR]` | Google | Rounded, friendly, modern | Consumer brands, apps |
| Parkinsans | Google | Approachable, interesting geometry | Friendly professional brands |
| Recursive | Google | Code-meets-brush, variable | Developer tools, creative tech |
| Satoshi | Fontshare | Clean, modernist, popular in design community | Modern brands, SaaS, portfolios |
| General Sans | Fontshare | Versatile, slightly warmer than Inter | Display and body, modern business |
| Cabinet Grotesk | Fontshare | Softened terminals, approachable | Friendly brands without being childish |
| Excon | Fontshare | Wide geometric, distinctive | Expanded headlines, futuristic brands |
| Panchang | Fontshare | Wide, expressive, futuristic | Display headlines, creative tech |

### Display — Serif

Editorial, luxury, theatrical.

| Font | Source | Character | Best For |
|---|---|---|---|
| Abril Fatface | Google | Theatrical, ultra-bold | Single-word heroes, magazine covers |
| Playfair Display `[BR]` | Google | High-contrast, classic | Formal elegance, editorial |
| Fraunces `[BR]` | Google | Retro-modern, quirky serif | Craft brands, editorial warmth |
| DM Serif Display `[BR]` | Google | High-contrast, elegant | Marketing headlines, brand pages |
| DM Serif Text `[BR]` | Google | Readable display serif | Subheadings, pull quotes |
| Zilla Slab | Google | Strong, contemporary slab | Tech-meets-craft, Mozilla lineage |
| Libre Bodoni | Google | Fashion, high-contrast | Luxury, fashion, style |
| Frank Ruhl Libre | Google | Condensed, unusual proportions | Unique serif headlines |
| Literata | Google | Refined, book-like | Premium content, literary |
| Antic Didone | Google | Thin, elegant, modern | Beauty, photography, dark/moody |
| Prata | Google | Sharp, classy | Fashion, elegant brands |
| Rozha One | Google | Heavy, dramatic | Bold serif impact |
| Ultra | Google | Extra-bold serif | Maximum serif weight |
| Gravitas One | Google | Vintage, bold | Retro-modern brand moments |
| Instrument Serif `[BR]` | Google | Modern editorial, sophisticated | Fashion, luxury, editorial |
| Cormorant Garamond `[BR]` | Google | Delicate, spiritual, graceful | Luxury, church, literary |
| Newsreader `[BR]` | Google | Newspaper editorial, warm | Journalism, storytelling |
| Supreme | Fontshare | Clean, contemporary serif | Modern editorial, brand headlines |
| Gambarino | Fontshare | Dramatic, high-contrast | Editorial impact, display |
| Zodiak | Fontshare | High-contrast, editorial elegance | Luxury brands, editorial |
| Bespoke Serif | Fontshare | Elegant, slightly quirky | Distinctive serif headlines |

### Display — Slab Serif

Sturdy, grounded, trustworthy.

| Font | Source | Character | Best For |
|---|---|---|---|
| Roboto Slab | Google | Clean, reliable | Established companies, trust |
| Arvo | Google | Geometric slab, friendly | Craftsman brands, approachable |
| Rokkitt | Google | Warm slab, versatile | Retail, lifestyle, food |
| Bitter | Google | Editorial slab, readable | Education, publishing, NGOs |
| Zilla Slab | Google | Strong, contemporary | Tech, open-source projects |

### Body — Sans

Readable, not the tired defaults.

| Font | Source | Character | Best For |
|---|---|---|---|
| Figtree | Google | Casual, friendly curves | Approachable brands, startups |
| Geist | Google | Swiss precision, technical. GF version lacks full glyph set; use npm `geist` for Next.js | Developer tools, modern SaaS |
| Manrope | Google | Soft geometric, warm | Consumer apps, wellness |
| Inter `[BR]` | Google | Neutral UI workhorse | Dashboards, admin panels (product register only) |
| DM Sans `[BR]` | Google | Clean geometric, versatile | UI, paired with DM Serif Display |
| IBM Plex Sans `[BR]` | Google | Corporate, systematic | Enterprise, design systems |
| Plus Jakarta Sans `[BR]` | Google | Clean, contemporary | Modern business, clean UI |
| Rubik | Google | Slightly rounded, approachable | Casual products, apps |
| Work Sans | Google | Slightly informal, grounded | Service businesses, practical brands |
| Barlow | Google | Grounded, no-nonsense | Industrial, service, municipal |
| Source Sans 3 | Google | Neutral, highly readable | Government, corporate, documentation |
| Nunito Sans | Google | Rounded, friendly, clean | Family-oriented, community |
| Albert Sans | Google | Versatile, intentional | Modern professional brands |
| Mulish | Google | Calm, adaptable | Wellness, health tech, clean SaaS |
| Karla | Google | Quirky, characterful | Personal brands, creative services |
| Quattrocento Sans | Google | Clean, well-spaced | Readable body alongside serif headings |
| Heebo | Google | Modern, Hebrew-influenced | Clean body text, international |
| Noto Sans | Google | Universal, consistent | International, multilingual |
| General Sans | Fontshare | Versatile, slightly warmer than Inter | Modern business, body text |
| Clash Grotesk | Fontshare | Softer sibling of Clash Display | Body text for Clash Display headlines |

### Body — Serif

Editorial, long-form, trust.

| Font | Source | Character | Best For |
|---|---|---|---|
| Libre Baskerville | Google | Classic, trustworthy | Legal, financial, traditional |
| Merriweather | Google | Screen-optimized, sturdy | Blogs, articles, long reads |
| Literata | Google | Refined, book-like | Premium editorial, ebooks |
| Lora `[BR]` | Google | Warm, calligraphic roots | Literary, wellness, church |
| PT Serif | Google | Quiet, professional | Institutional, understated |
| Source Serif 4 | Google | Clean transitional | Documentation, pairs with Source Sans |
| EB Garamond | Google | Classical, elegant | Formal, literary, religious |
| Spectral | Google | Warm, modern serif | Body text for brand surfaces |
| Crimson Pro `[BR]` | Google | Literary, readable | Editorial, academic, faith |
| Noto Serif | Google | Universal, unmodulated | International, consistent |
| Erode | Fontshare | Warm, contemporary, readable | Modern serif body text |
| Recia | Fontshare | Clean, modern body serif | Editorial body text |

### Script / Accent

Accent use ONLY. Never body text. Never more than one per page.

| Font | Source | Character | Best For |
|---|---|---|---|
| Great Vibes | Google | Flowing, elegant | Wedding, formal event accents |
| Alex Brush | Google | Classic brush script | Invitations, feminine brands |
| Dancing Script | Google | Lively, bouncing | Casual events, friendly brands |
| Pacifico | Google | Bold brush, casual | Beach, fun, casual brands |
| Allura | Google | Feminine, cursive | Beauty, wedding, lifestyle |
| Pinyon Script | Google | Romantic, formal | Traditional weddings |
| Courgette | Google | Elegant italic-script | Lifestyle, creative sites |
| Satisfy | Google | Retro script | Vintage, retro-modern accents |

### Monospace

Code, data, UI accent.

| Font | Source | Character | Best For |
|---|---|---|---|
| JetBrains Mono | Google | Developer, technical | Code blocks, dev tools |
| Azeret Mono | Google | Modern, wide | Creative mono accent, pricing displays |
| SUSE Mono | Google | Production-ready, technical | Admin panels, dashboards, data |
| Atkinson Hyperlegible Mono | Google | Maximum legibility | Accessibility-first products |
| Recursive Mono | Google | Casual/linear axis | Creative dev tools |
| Fira Code | Google | Ligatures for code | Code editors, terminal |
| IBM Plex Mono `[BR]` | Google | Corporate, systematic | Enterprise code, data |
| Space Mono `[BR]` | Google | Retro-futuristic | Design tools, creative tech |

### Self-Hosted Only

Require `@font-face` setup. Not available via CDN link tag.

| Font | Source | Character | Best For |
|---|---|---|---|
| Mona Sans | GitHub | Industrial grotesque, variable (weight + width axes) | Product UI, flexible branding |
| Hubot Sans | GitHub | Geometric, technical, idiosyncratic | Headers, pull-quotes, tech brands |

---

## Industry Pairings

Recommended headline + body combinations by context. Look up each font's source in the role tables above.

### Industrial / Trades / Construction

Roofing, painting, dumpsters, HVAC, plumbing, electrical.

| Headline | Body | Mood |
|---|---|---|
| Teko Bold | Barlow | Square, industrial, no-nonsense |
| Bebas Neue | Work Sans | Cinematic strength, practical body |
| Barlow Condensed Bold | Barlow | Same family, cohesive, tech-forward |
| Archivo Black | Source Sans 3 | Maximum weight headline, clean body |
| Clash Display | General Sans | Bold editorial, modern trades |

### Church / Ministry / Faith

Churches, nonprofits, religious organizations.

| Headline | Body | Mood |
|---|---|---|
| Cormorant Garamond | Nunito Sans | Graceful, spiritual, community |
| Lora Bold | Quattrocento Sans | Warm, calligraphic, trustworthy |
| EB Garamond | Figtree | Classical, friendly, reverent |
| DM Serif Display | Nunito Sans | Elegant, welcoming |
| Marcellus | Roboto | Sculpted, structured, timeless |

### Luxury / Beauty / Spa / Wellness

| Headline | Body | Mood |
|---|---|---|
| Antic Didone | Work Sans | Thin elegance, grounded body |
| Prata | Manrope | Sharp elegance, soft body |
| Libre Bodoni | Albert Sans | Fashion-forward, clean |
| Zodiak | General Sans | High-contrast editorial, modern |
| Supreme | Erode | Contemporary serif pairing |

### E-commerce — Aggressive / Performance

Supplements, tactical gear, fitness, outdoor, automotive.

| Headline | Body | Mood |
|---|---|---|
| Saira Condensed Bold | IBM Plex Sans | Tactical, dense, authoritative |
| Teko Bold | Rubik | Industrial, modern, mobile-friendly |
| Bebas Neue | Heebo | Impact headlines, clean product info |
| League Spartan Bold | Source Sans 3 | Bold presence, clean details |
| Clash Display | Barlow | Editorial impact, grounded body |

### E-commerce — Premium / Lifestyle

Fashion, jewelry, home goods, beauty products.

| Headline | Body | Mood |
|---|---|---|
| DM Serif Display | DM Sans | Matched family, elegant + clean |
| Libre Bodoni | Albert Sans | Fashion-forward, light body |
| Gambarino | General Sans | Dramatic headline, versatile body |
| Instrument Serif | Figtree | Modern editorial, approachable |
| Fraunces | Work Sans | Retro-modern, functional clarity |

### Event / Wedding / Party Rental

| Headline | Body | Accent Script |
|---|---|---|
| Playfair Display | Nunito Sans | Great Vibes |
| DM Serif Display | Figtree | Alex Brush |
| Cormorant Garamond | Montserrat | Dancing Script |
| Prata | Source Sans 3 | Allura |
| Josefin Sans | Work Sans | Pacifico (casual events) |

### Dashboard / SaaS / Admin

| Headline | Body / UI | Mono |
|---|---|---|
| Plus Jakarta Sans Bold | Plus Jakarta Sans | JetBrains Mono |
| Geist Bold | Geist | SUSE Mono |
| IBM Plex Sans Bold | IBM Plex Sans | IBM Plex Mono |
| Manrope Bold | Manrope | Azeret Mono |
| Inter Bold | Inter | Fira Code |

### Restaurant / Food / Hospitality

| Headline | Body | Mood |
|---|---|---|
| Abril Fatface | Figtree | Theatrical, warm |
| Fraunces | Work Sans | Craft/artisan, warm |
| Cormorant Garamond | Barlow | Elegant, European |
| Bitter | Source Sans 3 | Warm slab, approachable |
| Rokkitt | Mulish | Friendly, inviting |

### Legal / Financial / Professional Services

| Headline | Body | Mood |
|---|---|---|
| Libre Baskerville Bold | Libre Baskerville | Traditional authority |
| PT Serif Bold | Source Sans 3 | Quiet, professional |
| Noto Serif Bold | Noto Sans | Universal, consistent |
| EB Garamond Bold | Figtree | Classical, friendly |
| Archivo | Work Sans | Modern professional |

### Healthcare / Medical

| Headline | Body | Mood |
|---|---|---|
| Plus Jakarta Sans Bold | Plus Jakarta Sans | Clean, modern, trustworthy |
| Nunito Sans Bold | Nunito Sans | Rounded, friendly, accessible |
| Albert Sans Bold | Albert Sans | Professional, warm |
| Mulish Bold | Mulish | Calm, health-forward |
| Figtree Bold | Figtree | Approachable, clear |

### Creative / Agency / Portfolio

| Headline | Body | Mood |
|---|---|---|
| Bricolage Grotesque | Figtree | Quirky, distinctive |
| Satoshi Bold | General Sans | Modernist, design-community favorite |
| Familjen Grotesk | Barlow | Personality-driven, grounded |
| Panchang | Clash Grotesk | Wide, futuristic, bold |
| Epilogue Bold | Mulish | Contemporary, clean |

### Real Estate

| Headline | Body | Mood |
|---|---|---|
| DM Serif Display | DM Sans | Elegant, modern |
| Prata | Source Sans 3 | Sharp, classy |
| Archivo | Work Sans | Modern, professional |
| Libre Bodoni | Figtree | Fashion-forward, approachable |
| Supreme | General Sans | Contemporary serif, clean body |

---

## Brand Register Note

Fonts tagged `[BR]` are on [brand.md](brand.md)'s reflex-reject list: training-data defaults that create monoculture.

- **Brand register**: skip `[BR]` fonts and search deeper. The font selection procedure in brand.md still applies.
- **Product register**: `[BR]` fonts are available and often the right pragmatic choice. Inter for a dashboard is fine. Playfair Display for a product page is fine.
- **Industry pairings**: some pairings include `[BR]` fonts. In brand register, substitute with non-`[BR]` alternatives from the same role table. In product register, use as-is.

This catalog is a curated starting point. If nothing fits, browse external catalogs (Pangram Pangram, Future Fonts, Adobe Fonts, ABC Dinamo, Klim, Velvetyne).
