# Relay pitch

Desktop page for Relay pitch classification. One Record button. The score, out of 10, updates while the microphone is open. Past recordings sit in a side list.

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
