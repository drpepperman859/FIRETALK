# Azure Static Web Apps deployment

Azure Static Web Apps is the production target for the complete FIRETALK experience because it deploys the Vite frontend and the `/api/livekit-token` Azure Function together.

## 1. Create the resource

In the Azure Portal, create a **Static Web App** with:

- Plan: Free for initial testing
- Source: GitHub
- Repository: this repository
- Branch: `main`
- App location: `pwa-starter-main`
- API location: `pwa-starter-main/api`
- Output location: `dist`

The repository already contains `.github/workflows/deploy-azure.yml`. Azure will add the deployment token as the `AZURE_STATIC_WEB_APPS_API_TOKEN` GitHub secret.

## 2. Add application settings

In the Static Web App resource, open **Configuration > Application settings** and add:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
```

These values are server-side settings. Do not put them in `VITE_*` variables or commit them to the repository.

The Firebase web configuration is safe to ship to the browser, but Firebase Authentication and Realtime Database Rules remain the access controls. Anonymous sign-in must be enabled in Firebase, and `database.rules.json` should be deployed separately.

## 3. Deploy Firebase rules

From the app directory, with a Firebase CLI session authenticated:

```powershell
Set-Location .\pwa-starter-main
npx firebase-tools deploy --only database
```

## 4. Verify the deployment

After the GitHub Action finishes:

1. Open the generated Azure URL over HTTPS.
2. Confirm the chat header says `Live sync`.
3. Send a message from two browser sessions.
4. Click **Start voice call** and confirm the token endpoint returns a room token.
5. Confirm microphone permission, local publication, remote participant, and mute state in the call panel.

The LiveKit API endpoint should never be called directly with API credentials from the browser. The browser only calls `/api/livekit-token`.
