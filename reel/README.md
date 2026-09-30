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

| Time | Scene |
| --- | --- |
| 0–5 s | Title: Petr Kubelka. Relay. |
| 5–14 s | The problem: you only learn the pitch failed after you sit down |
| 14–26 s | What he built: talk for as long as you want, and the score updates while you speak |
| 26–34 s | The score locks when you hit Stop, or when a long pause has no words |
| 34–45 s | One overall score for how well the pitch explains an idea that helps developers, then one sentence on what to improve |
| 45–52 s | The recording and the session are saved |
| 52–60 s | The working product with the score on screen. The last frame holds. |

The score, transcript, and recommendation are sample values written into the page. The live app produces real ones.
