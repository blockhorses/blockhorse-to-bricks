This repo is `blockhorses/blockhorse-to-bricks`, a fork of `hs7j4yk4sz-boop/punk-to-bricks`. Convert it from turning a CryptoPunk into a brick bust to turning a BlockHorse into a brick model. Keep everything that makes punk-to-bricks good: the 3D build view, PDF booklet, build video, full-kit ZIP, LEGO Pick a Brick and BrickLink exports, and honest checks. Replace the input and the model.

## Read first

- `blockhorse-reference/README.md`: the agreed build. Every design decision is in there, so follow it rather than redesigning.
- `blockhorse-reference/build-blockhorse.js`: prototype builder in plain JS.
- `blockhorse-reference/builds/*.json`: the agreed builds. These are golden fixtures.
- `blockhorse-reference/horses.json`: trait colours for tokens 1 to 260.
- `blockhorse-reference/prototype.html`: a working prototype of the whole flow. Use it for behaviour and the colour logic.
- The source sprite is in `blockhorses/BlockHorses`, file `templates/horse.js`. Clone it if you want to check something.
- Read the existing `src/` before changing it, especially:
  - `core/parts.ts`, `core/check.ts`, `core/palette.ts`, `core/lego.ts`
  - `worker/build.worker.ts`
  - `viewer/*`
  - `export/*`
  - `main.ts`

## What to build

### 1. Input
- Replace "type your Punk number / drop an image" with a BlockHorse token picker: number 1 to 260, previous, next, random, and a row of example horses (one of each species).
- Show the original pixel sprite and the token's name, for example "#6 Purple Winged Unicorn".
- Put the 260 horses' traits in `src/data/horses.json`. Generate that file with a script in `scripts/` that parses `blockhorses/BlockHorses` `api/horse/*.svg`, with `blockhorse-reference/horses.json` as the expected output.
- Remove image detection, `public/punks.png`, and Punk-specific code and tests:
  - `core/detect.ts`
  - `core/analyze.ts`
  - Punk fixtures
  - `scripts/` that only exist for Punks

### 2. Model
- Port the builder to TypeScript as `scripts/build-horses.ts`. It writes `src/data/builds.json` with one build per species: horse, pegasus, unicorn, winged.
- This follows the same pattern as `scripts/build-elements.ts`: the seed search runs offline, and the site loads fixed builds.
- Every horse of a species uses that species' build. Only the colours change per token.
- The port must reproduce the golden builds piece for piece with the same seeds:
  - horse 1201
  - pegasus 1150
  - unicorn 2241
  - winged 1150
- Add a test that compares the port's output to the golden files.
- Drop the Mini/XL sizes. There is one size.
- Drop the curved slope part. These builds use only bricks, plates and the jumper.

### 3. Pieces
- Map builds onto the existing `Piece` type.
- Add the jumper as a new kind: the 1 × 2 jumper plate, BrickLink part 15573.
  - It has one stud, in the centre.
  - The horn pieces sit at z = 3.5, a half-stud offset.
- Check every place that assumes whole-stud positions and studs on every cell, and make each handle the jumper and the half-stud horn correctly:
  - `check.ts`: footprints, connections, studs
  - viewer geometry and stud instancing
  - the PDF step renderer and part icons
  - the parts list
- The checks must count the jumper's single stud correctly, and the horn's single-stud joints must not be reported as failures. The prototype treats "hangs on one stud" as a failure only for pieces larger than 1 × 1. Keep that rule and say so in the UI.
- Add 15573 to the parts that `scripts/build-elements.ts` covers.
  - If the Rebrickable exports are not in `real/`, stop and ask me to download them rather than inventing element IDs.
  - Until then, the jumper shows as BrickLink only.

### 4. Colours
- Each horse has these traits: coat, mane, tail, eyes, shoes, and optional horn and wings. Each trait is a CSS colour name.
- Map each trait to the nearest brick colour with the existing CIEDE2000 code and the existing `BRICK_COLORS` list, leaving out the transparent colours.
- Keep touching traits apart as the reference README describes.
- Base colour: a choice of Turf, Dirt, Sand or Stone. Dirt (Reddish Brown) is the default.
- Replace "Only parts LEGO sells" with "Only colours LEGO sells". The model never changes; it picks, per trait, the nearest colour that LEGO sells for every part that trait uses.
- Show each trait's original colour next to its brick colour.

### 5. Exports
- Keep the PDF booklet, ZIP, video, Pick a Brick CSV and BrickLink XML, and their size limits.
- Rename files and titles from Punk to BlockHorse, for example `blockhorse-6-purple-winged-unicorn.pdf`.
- In the instructions, label which way is head and tail and which side is the front: the side the sprite shows.

### 6. Copy and branding
- Rewrite `README.md`, `DISCLAIMER.md`, `index.html` meta tags, the OG image and the docs screenshots for BlockHorses.
- Credit punk-to-bricks by John Karp and keep the MIT licence.
- Say the site is unofficial and not affiliated with the LEGO Group or BrickLink.
- Link to `blockhorses/BlockHorses`.
- Remove all CryptoPunks wording and assets.

### 7. Deploy
- Make the GitHub Pages workflow work for this repo. `vite.config.ts` already uses a relative base.
- Make sure `npm run build` and `npm test` pass.

## How to work

- Start with a short plan listing the files you'll change, and wait for my OK before the big deletions.
- Work in small commits on a branch, then open a PR.
- Run the tests and a production build before the PR.
- Load the built site in Playwright and take screenshots of each step for one horse of each species. Put them in the PR.
- If something in the reference conflicts with how the existing code works, tell me which and why rather than quietly changing the build.
