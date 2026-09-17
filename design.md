# Redeem — design notes

**The record layer for Robinhood Stock Tokens.** Share-equivalents, holder intent and redemption
readiness, kept as a verifiable record before shareholder rights come onchain. The strongest motif is
THE RECORD: paper, engraved numerals, brushed metal, emerald glass, ledger rules.

## Theme

Light is the product's own theme; dark is a header toggle, stored in `localStorage["redeem-theme"]`
and applied before first paint by the inline script in `index.html`. Tokens live in
`packages/web/src/web/styles.css` and are mapped to Tailwind through `@theme inline`.

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| paper | `#f4f4ee` | `#0d1210` | Page |
| cream | `#faf9f3` | `#121816` | Surfaces, inputs |
| mint / mint-2 | `#e8eee7` / `#d8e3d9` | `#18211c` / `#1f2b24` | Section tints, hovers |
| ink / ink-2 | `#131614` / `#3b433e` | `#e9ede7` / `#b9c2ba` | Text |
| grey-green | `#5b6a61` | `#9aa79e` | Labels, secondary data |
| line | `#dfe3dc` | `#222c26` | Hairlines |
| emerald | `#1c6b4a` | `#5fbd8f` | The one accent |
| rust / amber | `#b0452b` / `#9a6d1f` | `#e0785a` / `#d9aa4f` | Against / roadmap |
| charcoal chamber | `#0b120e` | same | The one dark section per page |

Type: Newsreader (editorial serif) for display statements, Geist for UI, Geist Mono (tabular) for
every number, hash and address. Radii 8–16px; status marks instead of pills; ledger rules instead of
cards. Elevation: large diffuse ink-tinted shadows, used rarely.

Art: vector illustrations drawn in the palette (`archive.tsx`, `multiplier-plates.tsx`,
`record-cards.tsx`, `ownership.tsx`), composed into sections, never boxed in cards.

Photography: three Creative Commons photographs of Wall Street (Wikimedia Commons) as full-bleed
plates via `PhotoBand` — the NYSE facade on the home "precedent" section (paper tone), the Broad
Street lettering at night on How it works (dark tone), Wall Street from Federal Hall as the Markets
masthead (dark tone). Plates are desaturated, colour-blended toward emerald and washed toward the
surface so type sits on them. Every plate carries its credit in the corner; the footer lists all
three. At most one plate per page.

## Logo

The official Redeem mark (three record leaves, deep emerald to pale sage) supplied by the brand owner is
reproduced as vector in `packages/web/src/web/components/brand.tsx` (`Mark`) and `public/icon.svg`; the
favicon and touch icon are rendered from it. Company logos live in `public/assets/logos/tokens/`; the
Robinhood mark in `public/assets/logos/robinhood.svg`. User-facing copy says "Robinhood Chain" only —
the chain id stays in config and the API docs.

## Primitives

`Display`, `Eyebrow`, `Mark`, `Stat`, `Def`, `Button`, `Tabs`, `Ledger`/`RecordTable`, `SecurityRow`,
`RecordInspector`, `Distribution`, `MultiplierChart`, `OwnershipRule`, `OwnershipDiagram`,
`ShareEqCalculator`, `RecordTape`, `InfraStrip`, `CommandPalette` (⌘K), `Sheet`, `Annotation`.

## Rules baked into the copy

- Stock Tokens are ERC-20s issued by Robinhood Assets (Jersey) Limited, backed 1:1 by shares in custody.
- Voting and in-kind redemption for token holders are on the issuer's roadmap and not live.
- Redeem records INTENT, never a shareholder vote; every tally says INTENT · NOT A SHAREHOLDER VOTE.
- Never "you own the stock", never "Redeem votes", never a promise of redemption or settlement.
- Weight can only fall at cutoff, never rise. Every receipt names its block.
- Redeem is independent, custodies nothing, and is not affiliated with Robinhood or Say.
