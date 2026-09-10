# Google Play release

FIRETALK can be published as an Android Trusted Web Activity (TWA) using its deployed PWA:

`https://drpepperman859.github.io/FIRETALK/`

## Prerequisites

- A Google Play Console developer account
- Android Studio or the Android SDK and JDK 17
- A release keystore that is backed up securely
- The deployed HTTPS site available at the URL above

## Generate the Android project

From the app directory, install Bubblewrap and initialize from the production manifest:

```bash
cd pwa-starter-main
npx @bubblewrap/cli init --manifest https://drpepperman859.github.io/FIRETALK/manifest.json
```

Use these application values when prompted:

- Application name: `FIRETALK`
- Package ID: `com.drpepperman859.firetalk`
- Start URL: `https://drpepperman859.github.io/FIRETALK/`
- Display mode: `standalone`

Build the signed Android App Bundle:

```bash
npx @bubblewrap/cli build
```

Keep the generated keystore and passwords private. Upload the generated `.aab` file to a Play Console internal test track first.

## Verify the TWA origin

After Bubblewrap prints the signing certificate SHA-256 fingerprint, publish this file at the deployed site's `/.well-known/assetlinks.json` path:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.drpepperman859.firetalk",
      "sha256_cert_fingerprints": ["RELEASE_CERTIFICATE_SHA256"]
    }
  }
]
```

The GitHub Pages deployment must serve that file from `https://drpepperman859.github.io/.well-known/assetlinks.json`. Because GitHub Pages is hosting the project under `/FIRETALK/`, use a host or custom domain that can serve the root `/.well-known` path, or host the TWA wrapper through a provider that supports the required origin association.

## Play Console checklist

- Complete the app name, icon, screenshots, category, privacy policy, and content declarations.
- Upload the `.aab` to internal testing and verify login, messaging, offline behavior, and permissions on a physical Android device.
- Complete the Data safety form for Firebase Authentication, Realtime Database, and any analytics or crash services actually enabled.
- Promote the tested bundle to production after Play review requirements are satisfied.
