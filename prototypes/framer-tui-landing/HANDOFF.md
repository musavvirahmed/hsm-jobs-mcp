# Framer TUI landing handoff

Project ID: `ZsRUXFF37bRqGuKFmrcy`

## Decision

**C SESSION won.** Home `/` is the ask UI (duplicated C SESSION), not A Boxes.

- Home page: `augiA20Il` (`/`)
- Winning section on home: `sZhS5FqHU` (TUI Session) with WireTerrain `FfRy4o_dX`, Terminal `SeyghA5dD`, titlebar `clt8eQEAk`, TUIAsk `B1u3YIPLn`
- A Boxes section `CfaKibybV` was deleted from home
- Parallel layout on `/tui-session` (`Z1Sf3GrdB`): section `LFm2_zacL`, WireTerrain `gE4sX35Aa`, Terminal `rzxaeidM5`

## Layout (centered ask)

Section (`sZhS5FqHU` / `LFm2_zacL`):

- stack, vertical, `stackAlignment=center`, `stackDistribution=center`
- `minHeight=900px`, `fill=null`, `padding=24px`

WireTerrain: absolute `100%×100%`, `zIndex=0`, speed `0.25`, color `#00d7d7`

Terminal: relative, `width=100%`, `maxWidth=736px`, `zIndex=1`

## Chrome

- TUI Shell template: topbar `NlapoEsNE` and footer `cKn0W3rNp` set `visible=false`
- Template breakpoints centered

## Favicon

Uploaded from live Worker site `https://hsmjobs.musavvir.work/assets/favicon.webp` (same bytes as `src/assets/favicon.webp`).

Framer URL: `https://framerusercontent.com/images/yFomPpJmHqIjDvhpaPycTMMPr8w.webp`

Set on `rootNode` as `metadata.favicon`, `faviconDark`, and `appleTouchIcon`.

Local copy kept at `prototypes/framer-tui-landing/favicon.webp`.

## Code component sync

`TUIAsk.tsx` in this folder is synced from Framer code file `codeFile/YAX9B0L` (`TUIAsk.tsx`). Re-export from Framer after canvas edits.
