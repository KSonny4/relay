# Relay — judge run

Two attempts. Attempt 1 is Petr Kubelka's own pitch page: the 60-second motion film in `reel/`. He is pitching the whole application from that page. Then the live app. They stop the live recording themselves. Recording length is arbitrary. The score updates while they speak. The take locks when they press stop or after a long pause with no words. The locked screen is the classification: overall score, level, confidence, and one recommendation.

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

Petr Kubelka's pitch page, Attempt 1 only: open `reel/index.html` in a browser, or the same film on port 43125. No install.

## Attempt 1 — 60 seconds — Petr Kubelka's pitch

This is his own pitch page, the motion film in `reel/`. He is pitching the whole application from that page.

1. Open `reel/index.html`, or [http://127.0.0.1:43125](http://127.0.0.1:43125) if that page is being served.
2. Let the film play for the full minute.
3. Do not touch the live app during this minute. Leave [http://127.0.0.1:43123](http://127.0.0.1:43123) alone.

Then go to the live app.

## Attempt 2 — live app

Use the product at [http://127.0.0.1:43123](http://127.0.0.1:43123). The server on port 43124 is already running.

Start a recording and speak. Recording length is arbitrary. The score updates while they speak: overall score, level, confidence, and one recommendation. Press stop. A long pause with no words also locks the take. After it locks, leave that classification on screen.

If the mic cannot be used, paste this pitch and press Classify so the score still appears:

> Relay listens while a developer pitches an idea and writes the transcript as they speak. The score updates while they talk. They press stop when they are done. A long pause with no words also locks the take. The score is how well the pitch explains an idea that helps developers, plus the one thing to improve next. The recording and the session are saved.

## End screen

Stay on the locked classification:

- Overall score
- Level
- Confidence
- One recommendation

That screen is the end of the run.
