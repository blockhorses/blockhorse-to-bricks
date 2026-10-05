# BlockHorse brick build: reference

This folder records the build agreed during design. It is input for porting, not app code.

| File | What it is |
|---|---|
| `build-blockhorse.js` | Prototype builder (plain Node, no dependencies). Turns the sprite into a brick model and searches seeds for the best tiling. |
| `builds/*.json` | The agreed builds, one per species. Output of the builder with 3000 seeds. Treat these as golden fixtures. |
| `horses.json` | Trait colours for tokens 1 to 260, parsed from `blockhorses/BlockHorses` `api/horse/<n>.svg`, plus the hex value of every CSS colour name used. |
| `prototype.html` | Working single-page prototype: token picker, 3D viewer, layer instructions, parts list, Pick a Brick CSV and BrickLink XML. Use it for behaviour and colour-mapping logic, not for code structure. |

## Source sprite

- The sprite is the 32 × 32 SVG in `blockhorses/BlockHorses` `templates/horse.js`. Each layer is a group of 1-pixel `<line>` strokes.
- Layers are drawn in this order: shoes, horse body (back leg, front leg, core, head, ear), eye, tail, mane, then the optional horn (`unicorn`) and `wings`.
- The species comes from the traits:
  - wings only: Pegasus
  - horn only: Unicorn
  - both: Winged Unicorn
  - neither: Horse
- `zebra` exists in the template but no minted horse uses it.
- Counts: 227 horses, 11 pegasi, 15 unicorns, 7 winged unicorns.

## Build decisions

**Scale and rows**
- One pixel is one stud wide and one brick (3 plates) tall.
- Every pixel row is a full brick, so all rows match. The model is 20% taller than the sprite.
- Alternating brick and plate rows was tried and rejected.

**Base**
- 32 × 8 studs, made of two plate layers that cross each other.
- Bottom layer: rows of 2 × 8 plates running along the length, with alternate rows staggered by 2 × 4 plates at each end.
- Top layer: 2 × 8 plates running front to back.

**Depth**
The model is 6 studs deep, at z = 1..6 on the base.

| Part | Depth |
|---|---|
| Legs and shoes | Two pairs: front z 1–2 and back z 5–6 |
| Body core | Full depth, z 1–6 |
| Head | 4 deep, z 2–5 |
| Ears | z 2 and z 5 |
| Tail, mane-only pixels | 2 deep, z 3–4 |

- The mane fills z 3–4 between the ears on the lower ear row (sprite y = 9).
- Nothing goes between the ear tips (y = 8). The ear tips stand alone.

**Wings**
- One stud thick, one wing on each outer face (z 1 and z 6).
- Where a wing pixel overlaps the body core, the core keeps z 2–5.

**Horn**
- One stud thick and centred on the head (z = 3.5, a half-stud offset), placed by hand:
  1. A 1 × 2 jumper plate (BrickLink 15573) sits on the two centre studs of the mane crest.
  2. Two 1 × 2 plates stack on the jumper, so jumper plus plates make one brick height.
  3. 1-stud-wide bricks step up and forward above that.
- Each step above the plates is held by a single stud. This is expected.

**Corner fills**
- Sprite pixels that touch only at a corner can't be held by studs.
- The horn becomes a staircase with 2-pixel steps.
- Three notches between the wing tips are filled: (5,3), (5,5), (5,7).

**Hidden cells**
- Fully enclosed cells may take any role's colour, so pieces can bridge between colours inside the body.

## Checks every build passes

- Every piece is connected to the base through studs (one group).
- No piece floats and no two pieces overlap.
- No piece larger than 1 × 1 hangs on a single stud.

| Species | Pieces | Bricks tall incl. base | Seed |
|---|---|---|---|
| Horse | 174 | 24 rows, 23.7 cm | 1201 |
| Pegasus | 206 | 29 rows, 28.5 cm | 1150 |
| Unicorn | 179 | 26 rows, 25.6 cm | 2241 |
| Winged Unicorn | 212 | 29 rows, 28.5 cm | 1150 |

Every build is 25.6 cm long (32 studs) and 6.4 cm deep (8 studs).

## Colours

- Each trait's CSS colour name is mapped to the nearest of the 35 opaque brick colours using CIEDE2000.
- Traits that touch keep different brick colours when their original colours differ. The touching pairs are: mane/coat, tail/coat, eye/coat, shoes/coat, wings/coat, eye/mane, horn/mane, horn/coat.
- An "Only colours LEGO sells" option picks the nearest colour that has a LEGO element ID for every part that trait uses.
