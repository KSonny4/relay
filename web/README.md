# Relay pitch

A Relay pitch app that uses the width of a computer and reflows on a phone. One Record action starts a new take. While the microphone is open, the screen is the words plus execution, usefulness, clarity, and their total out of 20. History lists each recording the same way. Opening one shows the saved transcript, those criteria, the total, and the next step.

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
