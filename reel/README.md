# Relay pitch film

Petr Kubelka's 60-second pitch film for Relay. He stands in front of it while he says the pitch. It is one self-contained file, `index.html`. It makes no network calls, needs no API keys, and has no build step.

## Play it

Open `reel/index.html` in a browser. It starts playing on load.

Or serve it on port 43125:

```bash
python3 -m http.server 43125 --bind 127.0.0.1 --directory reel
```

Then open http://127.0.0.1:43125/.

Space pauses and resumes; on the last frame it restarts. The thin bar at the top shows progress through the 60 seconds. Add `#t=30` to the URL to start at second 30 for rehearsal.

## What is on screen

On the left, the words are the "60 seconds" section of the pitch (`docs/pitch.md` in the project store), word for word. The pitch's timestamps are the scene cuts: 0:00, 0:10, 0:32, 0:42 and 0:50. Sentences inside a section appear one at a time, spaced by word count. Black type on white, laid out for a 16:9 desktop screen. The current sentence is large and black; earlier sentences in the same section shrink and turn grey. The script lives in the `PITCH` block in `index.html`.

On the right, from 0:10, the product works beside three judging outcomes:

- **Usefulness** lights with "Relay fixes that before you stand up."
- **Clarity** lights with "Then it gives you one line to fix." and the opening sentence is marked as the line to fix.
- **Execution** lights with "That is working right now."

The transcript fills in with the sentences as they are said. The score out of 10 moves while the pitch is spoken and reaches **9.6**, with the level "A developer would know what to try next". That is the live API result for these exact words, recorded in `docs/pitch.md` under "Live scores".

The first frame shows "Petr Kubelka" and "Relay". From 0:10 a small "Petr Kubelka · Relay" stays in the bottom-left corner. The last frame holds.
