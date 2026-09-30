# Relay pitch film

Petr Kubelka's pitch film for Relay, the 60-second pitch in five scenes. He stands in front of it while he says the pitch. It is one self-contained file, `index.html`. It makes no network calls, needs no API keys, and has no build step.

Public: https://relay-reel.onrender.com

## Play it

Open `reel/index.html` in a browser, or serve it on port 43125:

```bash
python3 -m http.server 43125 --bind 127.0.0.1 --directory reel
```

Then open http://127.0.0.1:43125/.

It opens on the first scene and does not move by itself. Right arrow, Down, Page Down, Space, Enter or a click move to the next scene. Left arrow, Up, Page Up, Backspace or a click on the left quarter of the screen move back. The page stays on the chosen scene, and the address ends in `#1` to `#5`, so a reload or a link opens the same scene. The thin bar at the top shows which scene of five is on screen.

## What is on screen

Wide 16:9 frame, black type on white. On other screen shapes the frame letterboxes instead of reflowing.

On the left, the words are the "60 seconds" section of the pitch (`docs/pitch.md` in the project store), word for word. There is one scene per timestamp (0:00, 0:10, 0:32, 0:42, 0:50). The script lives in the `SCENES` block in `index.html`.

On the right, from scene 2, the product works beside the three judging criteria, each 1 to 5:

| Criterion | Score | Weight |
| --- | --- | --- |
| Execution | 4.6 | ×2 |
| Usefulness | 4.9 | ×1 |
| Clarity | 5.0 | ×1 |

Total = (Execution × 2) + Usefulness + Clarity = 4.6 × 2 + 4.9 + 5.0 = **19.1 / 20**. Usefulness and Clarity appear in scene 2; Execution and the total appear in scene 3 ("That is working right now.").

The criterion scores come from one call to Jev (`jev-latest`) on Sep 30, 2026, with the exact 60-second words as the state and one 1–5 score question per criterion taken from the judging table: Execution 4.55, Usefulness 4.85, Clarity 4.97. The film shows them to one decimal and adds up the shown values. The line to fix is the one-sentence improvement Relay's improvement prompt returned for the same words.
