# README style (ASD-STE100)

The root [README.md](../../README.md) is the **human-first** entry point — hsm-mcp-shaped:
short pitch, **Use/Connect**, tools, reading answers, then **Architecture**.
Operators use [docs/README-developers.md](../README-developers.md) for env contract, crawl
runbook, and CI detail.

## Rule

**Every rewrite or material edit to `README.md` must follow ASD-STE100 principles in STE-flavored mode.**

Reference: [asd-ste100-skill](https://github.com/danyuchn/asd-ste100-skill) (Simplified Technical English adapted for clarity).

## STE-flavored mode (README)

Apply these on every README edit:

| Do | Don't |
| --- | --- |
| Short sentences (≤25 words for descriptions) | Long compound sentences joined by semicolons |
| Active voice ("Run this command") | Passive voice with hidden actor |
| One instruction per sentence or numbered step | Several actions buried in one paragraph |
| Plain words; define domain terms once | Unexplained jargon (D1, partial index, dogfood) in the connect hero |
| Succinct connect-first layout (public URL hero) | Long private-release tutorials as the Product README hero |
| Keep every fact, warning, and scope qualifier | Drop precision to sound simpler |
| Same term every time (e.g. always "AI tool" or always "MCP client" in one section) | Synonym rotation (user / customer / operator) |

Lexical rules (one-word-one-meaning dictionary lockdown) are **advisory** for README prose. Structural rules are **required**.

## Audience split

| File | Audience | Tone |
| ---- | -------- | ---- |
| `README.md` | Humans trying the product | Connect-first Product README; Architecture below the fold; short Local / private release only |
| `docs/README-developers.md` | Operators, agents, CI | Full env contract, crawl runbook, CI; may repeat Architecture for operators |
| `src/packaging.ts` + discovery page | Live site parity | Locked strings; README should not drift from example asks |

## Shared-release WIP marker

While shared `/mcp` is blocked, Product README and the discovery page show `coming soon` next to the public `/mcp` URL. Remove that marker when **shared release** unlocks (`shared-release:verify` passes). Do not invent a fake host.

## Before merging README changes

1. Read the diff aloud — would a kennismigrant follow Connect without a tutorial essay?
2. Run `npm test -- test/packaging.test.ts`.
3. Do not add golden-test marketing copy (ADR 0007).
4. Move new operator/CI detail to `docs/README-developers.md`, not the root README.
5. Keep Architecture on the Product README in sync with the deployed system and ADR 0009.

## Optional skill

Install the upstream skill for rewrite passes:

```bash
git clone https://github.com/danyuchn/asd-ste100-skill ~/.claude/skills/asd-ste100
```

Then ask: *Apply STE-flavored rewrite to README.md* or *disambiguate this README section*.
