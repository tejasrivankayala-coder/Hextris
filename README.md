# Hextris-style game

A browser game inspired by [Hextris](https://hextris.io): rotate the hexagon to catch incoming colored blocks, match 3+ of the same color on a side to clear them and score. Don’t let any side fill up.

## How to play

- **Rotate:** Arrow keys ← → or **A** / **D**
- **Mobile:** Swipe left or right to rotate
- **Goal:** Match 3 or more blocks of the same color on a side to clear them. Build combos for more points. Game over if a side has 5 blocks.

## Run locally

Open `index.html` in a browser, or use a local server:

```bash
cd hextris-game
npx serve .
```

Then open the URL shown (e.g. http://localhost:3000).

## Files

- `index.html` – Page and canvas
- `styles.css` – Layout and UI
- `game.js` – Game loop, hexagon, blocks, matching, scoring
