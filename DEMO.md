# Relay — judge run

Two attempts. Attempt 1 is the motion page. Attempt 2 is the live app. When time stops, the screen is the classification: overall score, level, confidence, and one recommendation.

The score answers one question: how well does this pitch explain an idea that helps developers?

## Keys

These live outside git. Do not commit them. The server reads them from the process environment:

- `DEEPGRAM_API_KEY`
- `OPENAI_API_KEY`
- `TYPESAFE_API_KEY`
- `DATABASE_URL`

`DATABASE_URL` may be unset. The server then keeps sessions in memory, and the demo still runs.

## Start

Other lanes have not landed READMEs on `main` yet. These commands assume `npm install` and `npm run dev` inside `web/` and `server/`.

Server, port 43124:

```bash
cd server
npm install
npm run dev
```

Web, port 43123:

```bash
cd web
npm install
npm run dev
```

Leave both running. Open the product at [http://127.0.0.1:43123](http://127.0.0.1:43123). It calls the server at [http://127.0.0.1:43124](http://127.0.0.1:43124).

Motion page, Attempt 1 only: open `reel/index.html` in a browser, or the same page on port 43125. No install.

## Attempt 1 — 60 seconds — motion

1. Open `reel/index.html`, or [http://127.0.0.1:43125](http://127.0.0.1:43125) if that page is being served.
2. Let it play for the full minute.
3. Do not touch the live app during this minute. Leave [http://127.0.0.1:43123](http://127.0.0.1:43123) alone.

## Attempt 2 — 120 seconds — live app

Use the product at [http://127.0.0.1:43123](http://127.0.0.1:43123). The server on port 43124 is already running.

Start Attempt 1 in the product only if time remains. That recording caps at 60 seconds, then the page classifies.

If a full spoken attempt will not fit, do not open the mic. Paste this pitch and press Classify so the score still appears:

> Relay listens while a developer pitches an idea, writes the transcript as they speak, and stops at 60 seconds on the first attempt or 120 on the second. It then scores how well the pitch explains an idea that helps developers, and names the one thing to improve next. The recording and the session are saved.

## End screen

Stay on the classification:

- Overall score
- Level
- Confidence
- One recommendation

That screen is the end of the run.
