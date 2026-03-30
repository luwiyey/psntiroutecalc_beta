## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Android App

This repo also includes a Capacitor Android wrapper, so you can keep both:

- the hosted PWA
- the Android app for Google Play

Useful commands:

- `npm run android:sync`
- `npm run android:open`
- `npm run android:assemble:debug`
- `npm run android:bundle:release`

Release notes and Play submission steps are in [docs/ANDROID_PLAY_RELEASE.md](docs/ANDROID_PLAY_RELEASE.md).
