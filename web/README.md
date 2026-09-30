# Relay pitch

Desktop pages for a Relay pitch. One Record action starts a new take. While the microphone is open, the screen is the words and the score out of 10. History lists saved recordings. Opening one loads that session and shows the score and the next step.

## Run

```bash
cd web
npm install
npm run dev
```

The app serves on [http://127.0.0.1:43123](http://127.0.0.1:43123). By default it calls `https://relay-server-9hzn.onrender.com`. Set `NEXT_PUBLIC_RELAY_API_BASE=http://127.0.0.1:43124` to use a local API instead.

## Test

```bash
npm test
```

Tests do not call live APIs.
