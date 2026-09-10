# FIRETALK

FIRETALK is a lightweight installable chat workspace with Firebase Realtime Database messaging, IndexedDB offline persistence, and optional LiveKit voice calls.

## Local development

From the repository root:

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173/`. Production preview uses:

```bash
npm run build
npm run preview
```

## Firebase setup

The public web configuration is in `src/config/firebase-config.ts`; deployment-specific `VITE_FIREBASE_*` values can override it through `.env.local`. Enable Anonymous sign-in in Firebase Authentication and deploy the database rules from the app directory:

```bash
cd pwa-starter-main
npx firebase-tools deploy --only database
```

The database rules require an authenticated user, limit messages to 4,000 characters, and index `createdAt` for live conversation queries. The chat header shows `Live sync` when Firebase is connected and falls back to IndexedDB when it is unavailable.

## LiveKit voice calls

Voice calls require a server-side token endpoint. Configure these secrets in the hosting provider, never in client code:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

The endpoint is `api/livekit-token`. Azure Static Web Apps is the supported production target because it can deploy the static Vite app and the API function together. The repository workflow is `.github/workflows/deploy-azure.yml`; the full resource and secret setup is in `docs/azure-deployment.md`. For local deployment, use `swa-cli.config.json` and run:

```bash
cd pwa-starter-main
npm run build
npx @azure/static-web-apps-cli deploy
```

GitHub Pages can publish the static chat UI through the workflow in `.github/workflows/main.yml`, but it cannot host the LiveKit token endpoint, so voice calls remain unavailable there unless the API is deployed separately.

## Production checklist

- Run `npm run build` and verify the generated `dist` folder.
- Configure Firebase Anonymous Auth and deploy `database.rules.json`.
- Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` as hosting secrets.
- Test `Live sync`, message delivery in two sessions, offline reload, and voice-call permissions on HTTPS.
- Deploy the `dist` output and `api` function through Azure Static Web Apps for the complete feature set.
