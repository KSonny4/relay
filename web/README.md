# Relay pitch

Next.js page for Relay pitch classification. A take has no time limit. It ends when you press stop, or after about 10 seconds with no new words.

While the microphone is open, each finished phrase updates the on-screen score. The recommendation appears after the take is saved.

## Run

```bash
cd web
npm install
npm run dev
```

The app serves on [http://127.0.0.1:43123](http://127.0.0.1:43123). It calls the Relay API at `http://127.0.0.1:43124`.

`POST /api/classify` updates the live score. `POST /api/sessions` saves the take when it ends. The browser asks `POST /api/deepgram/token` for a short-lived Deepgram access token. The long-lived Deepgram key is not part of this app.

## Test

```bash
npm test
```

Tests do not call live APIs.
