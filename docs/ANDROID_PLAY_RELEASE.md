# Android And Play Release

This project can keep both:

- the hosted PWA for fast updates and browser testing
- the Capacitor Android app for Google Play submission

The Android app uses the same web codebase and builds from `dist/`.

## What is already configured

- Android package id: `com.psnti.routecalc`
- Compile / target SDK: `35`
- Capacitor Android wrapper
- Release build can use `android/keystore.properties` if you add one

## Permissions currently declared

- Internet
- Network state
- Fine location
- Coarse location
- Record audio

These match the current app features more closely than the original minimal manifest.

## Important reality for voice

The Android app is the best long-term path, but the current voice flow is still web-driven inside Capacitor.
That means it may still behave differently from Chrome PWA or native Google Assistant on some phones.
If voice quality becomes the top priority later, the next upgrade should be stronger native or backend speech-to-text.

## First-time setup

1. Install dependencies:

```powershell
npm install
```

2. Build and sync web assets into Android:

```powershell
npm run android:sync
```

3. Open the Android project:

```powershell
npm run android:open
```

## Java version for Android builds

Use `JDK 21` for the Android/Gradle build.

If you see an error like:

- `Unsupported class file major version 69`

that usually means the build is running on Java 25 instead of JDK 21.

Recommended fix:

- open the project in Android Studio
- use the bundled `JDK 21`
- or set `JAVA_HOME` to a JDK 21 installation before running Gradle from the command line

## Optional signing setup for CLI release builds

If you want `bundleRelease` to use your upload key from the command line:

1. Copy the example file:

```powershell
Copy-Item android\keystore.properties.example android\keystore.properties
```

2. Edit `android/keystore.properties` and replace the values with your real keystore details.

Expected fields:

- `storeFile`
- `storePassword`
- `keyAlias`
- `keyPassword`

3. Put the `.jks` file inside `android/` or update `storeFile` to the correct path.

The real `android/keystore.properties` file is ignored by git.

## Build the first Android App Bundle

If signing is already configured:

```powershell
npm run android:bundle:release
```

Output bundle:

- `android\app\build\outputs\bundle\release\app-release.aab`

If you prefer Android Studio:

1. Run `npm run android:sync`
2. Run `npm run android:open`
3. In Android Studio, choose:
   - `Build`
   - `Generate Signed App Bundle / APK`
   - `Android App Bundle`

That is often the easiest first Play build.

## Local debug build

```powershell
npm run android:assemble:debug
```

## Before Google Play submission

Prepare these outside the codebase too:

- privacy policy URL
- app icon / screenshots / feature graphic
- Play Store description
- Data safety answers
- microphone and location disclosure text inside the app

## Recommended release flow

1. Test in the PWA first
2. Test in the Capacitor Android app on a real phone
3. Upload an internal testing bundle to Google Play
4. Validate microphone, location, login, voice, and GPS behavior there
5. Only then move to closed or production release
