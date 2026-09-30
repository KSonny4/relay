# Relay pitch film

Petr Kubelka's 60-second pitch film for Relay. He stands in front of it while he pitches the application. It is one self-contained file, `index.html`. It makes no network calls, needs no API keys, and has no build step.

The 60 seconds is only the length of this film. Relay itself has no time limit: you talk for as long as you want.

## Play it

Open `reel/index.html` in a browser. It starts playing on load.

Or serve it on port 43125:

```bash
python3 -m http.server 43125 --bind 127.0.0.1 --directory reel
```

Then open http://127.0.0.1:43125/.

## Controls

- Space pauses and resumes.
- Space on the last frame restarts from 0.
- The thin bar at the top shows progress through the 60 seconds.
- Add `#t=30` to the URL to start at second 30 (useful for rehearsal).

## Scenes

The words on screen are the "60 seconds" section of the pitch (`docs/pitch.md` in the project store), word for word. The film adds no other copy. The pitch's timestamps are the scene cuts. Sentences appear one at a time at roughly speaking pace (about 150 words a minute). The current sentence is large and bright. Earlier sentences in the same scene shrink and dim.

| Time | On screen |
| --- | --- |
| 0:00–0:12 | Title lockup: Petr Kubelka, Relay. Then: "Developers ship the product, then lose the room." "They find out the pitch failed after they sit down." |
| 0:12–0:32 | "Relay is the rehearsal." "You talk for as long as you need." "The transcript runs in front of you." "A score moves while you are still speaking: how well this pitch explains an idea that helps developers." |
| 0:32–0:48 | "You press stop when you are done." "A long pause with no words locks it too." "Then one sentence: the next line to fix." "The recording and the session stay, so the next take can be better." |
| 0:48–1:00 | "I am pitching Relay on Relay." "A developer should leave knowing what it is, why it helps, and what to do next." Then three large beats: "Talk." "Watch the score move." "Stop." The last frame holds. |

From 0:12 on, a small "Petr Kubelka · Relay" lockup stays in the bottom-left corner.

A score out of 10 sits in the top-right corner. It appears with "A score moves while you are still speaking", climbs from 1.0 to 7.8 while the pitch is spoken, and turns green and locks with "A long pause with no words locks it too." It stays on screen to the last frame. 7.8 is a sample value; the live app produces the real one.

## Scene-by-scene version

`story.html` is an alternative 60-second film that tells the same story with its own copy instead of the pitch text: title, the problem, the live score, the score locking, one overall score (7.8 / 10) and one sentence to improve, the saved recording and session, and a held frame of the working product. Open http://127.0.0.1:43125/story.html.
