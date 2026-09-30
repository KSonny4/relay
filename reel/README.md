# Relay pitch film

Petr Kubelka's pitch deck for Relay. The room sees short slides: a few words each, the main point. Petr reads the full voiceover from his phone. There are two presentations of the same slides, each with its own phone control:

| Presentation | Slides | Phone control |
| --- | --- | --- |
| Offline | https://relay-reel.onrender.com | https://relay-reel.onrender.com/control |
| Online, with the live app beside the slides | https://relay-reel-live.onrender.com | https://relay-reel-live.onrender.com/control |

Slides 1 to 5 are the one-minute talk, in judge order: what was built and that it works, then the problem and who would use it, then what this is and why it matters, then the close. Petr stops after slide 5 when he has one minute. The phone shows red text, "Stop here.", on that slide only, so a two-minute talk that continues past it skips the reminder. Slides 6 to 8 continue: how a take works, the technologies, and what's next (any spoken words, against criteria you set; a corporate meeting is the example). The online deck adds one slide in front ("Recording starts on the next slide."), so it has nine.

## Files

| File | What it is |
| --- | --- |
| `slides.js` | Every slide: `say`, the voiceover shown on the phone, and `show`, the few words on the slide. Both decks and both phone pages read it. |
| `index.html` | The deck: the slides, the score card, and manual advance. |
| `live.html` | The online page: `index.html` on the left and https://relay-web-s1d6.onrender.com/?present=1 on the right. |
| `control.html` | The phone page: the voiceover for the current slide, with Back and Forward. |
| `sync.js` | Keeps a deck and its phone page on the same slide. |
| `server.py` | Serves one site and holds its current slide. Python 3, no dependencies. |

## Run it

```bash
python3 reel/server.py            # offline: http://127.0.0.1:43125/ and /control
python3 reel/server.py online     # online:  http://127.0.0.1:43126/ and /control
```

Opening `reel/index.html` straight from disk also works. The slides move on their own and no phone is connected.

## Moving the slides

Everything is manual; nothing advances by itself.

- On the deck: Right arrow, Down, Page Down, Space, Enter or a click go forward. Left arrow, Up, Page Up, Backspace or a click on the left quarter go back. Home and End jump to the first and last slide. The ‹ › buttons work too.
- On the phone: Back and Forward. Stop recording is on every slide, small, and big on the one-minute end and on the last slide. The one-minute end also says "Stop here." in red. None of that is on the projected slides. The page keeps the screen awake while Petr presents, where the browser allows it.
- The deck and the phone stay on the same slide. A move on either one reaches the other through that site's own server (`/api/slide`, pushed as server-sent events, with a poll as backup). Stop recording posts to `/api/stop-recording` on that same server and does not change the slide. The offline and online sites each keep their own slide, so each phone moves only its own deck. The scoring API is not involved.
- The address ends in `#1` to `#8` (online: `#1` to `#9`). When the deck opens, it jumps to the slide the server holds, so a reloaded deck rejoins the phone.

## Online presentation

The live app runs beside the slides with microphone access. Arriving on slide 2, the first pitch slide after the intro, posts `{ type: "relay:start-recording" }` to the app frame (target origin `https://relay-web-s1d6.onrender.com`). It posts again every time he leaves and comes back, from the keyboard, a click or the phone. A deck that opens already on that slide does not post it. Stop recording on the phone posts `{ type: "relay:stop-recording" }` to the same frame, once per press. While the app has focus, keys go to the app. Moving the pointer back over the slides returns the keys to the slides.

## What is on screen

Wide 16:9 frame, black type on white. On other screen shapes the frame letterboxes instead of reflowing.

The phone page is the voiceover, in `slides.js`. Slides 1 to 5 answer the three judge questions in order. Execution: one rubric, live, out of 20, one line to fix, the take kept, the same questions every time. Usefulness: you finished your pitch, you got a low score, you don’t know why, and a team would use this. Clarity: a score and one line, and you know the number before you stand up. Slides 6 to 8 say how a take works, which technologies do that job, and what is next: criteria you set, any spoken words, a corporate meeting as the example, this hackathon as the first use. The slides show only the main point of each, in words that stand on their own.

From slide 2 on (slide 3 online), the score card shows the three judging criteria, each 1 to 5:

| Criterion | Score | Weight |
| --- | --- | --- |
| Execution | 4.6 | ×2 |
| Usefulness | 4.9 | ×1 |
| Clarity | 5.0 | ×1 |

Total = (Execution × 2) + Usefulness + Clarity = 4.6 × 2 + 4.9 + 5.0 = **19.1 / 20**.

The criterion scores come from one call to Jev (`jev-latest`) on Sep 30, 2026. The state was the exact 60-second words, with one 1–5 score question per criterion from the judging table: Execution 4.55, Usefulness 4.85, Clarity 4.97. The card shows them to one decimal and adds up the shown values. The line to fix is the one-sentence improvement Relay's improvement prompt returned for the same words.

## Render

Both services run the `python:3.12-alpine` image with the same `server.py`:

| Service | `DECK_MODE` | Boot env var |
| --- | --- | --- |
| `relay-reel` | `offline` | `REEL_BOOT_B64` |
| `relay-reel-live` | `online` | `LIVE_BOOT_B64` |

`REEL_ZIP_B64` is a base64 zip of `index.html`, `live.html`, `control.html`, `slides.js` and `sync.js`. The boot env var holds `server.py`, and the start command is `python -c exec(__import__('base64').b64decode(__import__('os').environ['<boot env var>']))`. The current slide lives in memory, so it resets to slide 1 when a service restarts.
