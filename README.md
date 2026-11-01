# NEXIRA 2D Prototype

A mobile-first, 2D cognitive battle prototype. The UI and game rules run locally in the browser or a Capacitor Android WebView; there is no online account, matchmaking, or backend.

## Requirements

- Node.js 20.19+ (Node 24 is verified in this workspace)
- JDK 17 or 21 for Android builds (JDK 21 is the verified choice for this project)
- Android SDK Platform 35, Build Tools 35.0.0, and Platform Tools

Install JavaScript dependencies and start the browser prototype:

```sh
npm install
npm run dev
```

Run the game-rule tests and production web build:

```sh
npm test
npm run build
```

## Android APK

The Android project is generated with Capacitor. If it has not been generated yet, set the Android SDK and Java paths and add the native platform:

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="/path/to/jdk-21"
npx cap add android
```

This project uses Gradle Wrapper 8.11.1 and Android Gradle Plugin 8.7.2. AGP 8.7 requires JDK 17 or newer and Gradle 8.9 or newer. Gradle 8.11.1 officially supports running on Java 21, but not Java 25; select a JDK 17 or 21 before building:

```sh
export JAVA_HOME="/path/to/jdk-21"
export PATH="$JAVA_HOME/bin:$PATH"
npm run android:apk
```

The Android SDK Platform 35 and Build Tools 35 are used by this project. The Android Gradle and plugin versions do not need to be upgraded for this setup.

Build an unsigned-for-release, debug-signed APK:

```sh
npm run android:apk
```

Android Gradle writes the debug APK to `android/app/build/outputs/apk/debug/app-debug.apk`; `npm run android:apk` also copies that exact file to `build/NEXIRA-Android.apk`. Android Gradle creates a local debug key automatically. A release build still needs a private release keystore and signing configuration; neither is included in this prototype.

To install and launch the debug APK on a connected, authorized device:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.nexira.prototype/.MainActivity
```

## Structure

- `src/App.jsx` — screens, shared page/panel components, navigation, local interactions, splash transition, and timer lifecycle
- `src/game/data.js` — the eight categories, sample questions, and local profile persistence
- `src/game/scoring.js` — answer scoring, speed bonuses, and XP progression
- `src/game/session.js` — challenge state validation, answer locking, timeout handling, and completion
- `src/game/*.test.js` — automated game-rule, challenge, and persistence tests
- `src/styles.css` — shared mobile-first visual system and responsive 2D interface
- `src/app.css` — screen-specific layout and accessibility styles
- `src/theme.css` — NEXIRA cyber-neon visual theme and shared responsive HUD/card treatments
- `capacitor.config.json` — Capacitor app identity and web asset directory

All player progress uses browser/Android WebView local storage. Rankings show only saved local category bests; there are no online services or multiplayer. The eight game screens share a mobile-first Orbitron/Inter cyber-neon visual system, reusable glass panels, CSS-generated 2D artwork, and restrained transitions. Android displays a native branded launch splash followed by the app's animated NEXIRA transition. There are no 3D models, WebGL, or 3D-rendering dependencies. Google Fonts load from the network when available and fall back to system sans-serif fonts offline.