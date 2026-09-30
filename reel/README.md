# Relay pitch film

Petr Kubelka's pitch film for Relay, the 60-second pitch in five scenes. He stands in front of it while he says the pitch. It comes in two versions:

| Version | File | Public URL |
| --- | --- | --- |
| Offline | `index.html` | https://relay-reel.onrender.com |
| Online, beside the live app | `live.html` + `live_server.py` | https://relay-reel-live.onrender.com |

The offline version is one self-contained file. It makes no network calls, needs no API keys, and has no build step. The online version is described under [Online presentation](#online-presentation).

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

## Online presentation

`live.html` puts the same slides on the left and the live Relay web app, https://relay-web-s1d6.onrender.com, on the right. The slides are `index.html` itself, framed as `deck.html`, so the two presentations cannot drift apart: same five scenes, same score card, manual advance only.

- The slide keys (arrows, Page Up/Down, Space, Enter, Home, End) move the slides when the page has focus. The ‹ › buttons and clicks on the slides work as in the offline version. The address ends in `#1` to `#5` and a reload opens that scene.
- The right side is the real relay-web app with microphone access. Record, speak and Stop there; relay-web transcribes and scores through relay-server on its own. While the app has focus, keys go to the app; moving the pointer back over the slides returns the keys to the slides.

Run it locally with Python 3 and no dependencies:

```bash
python3 reel/live_server.py
```

Then open http://127.0.0.1:43126/. The local server serves `/` (`live.html`) and `/deck.html` (`index.html`).

On Render, the `relay-reel-live` service runs the `python:3.12-alpine` image. `LIVE_HTML_B64` holds `live.html`, `DECK_HTML_B64` holds `index.html` and `LIVE_BOOT_B64` holds `live_server.py`. The start command is `python -c exec(__import__('base64').b64decode(__import__('os').environ['LIVE_BOOT_B64']))`.
