# Immi Insight for iPhone and Android

Native shells (Capacitor 8) around the live app at https://au-insight.vercel.app.

What you get over the website or the home-screen web app:

- **Full screen.** No Safari address bar or toolbar; the app draws under the status bar like any native app.
- **No keyboard toolbar.** iOS shows a ⌃ ⌄ Done bar above the keyboard for web pages; the app hides it
  (`Keyboard.setAccessoryBarVisible`, called from `app/web/index.html` when it runs inside the shell), so the
  chat's send button sits right on the keyboard. Return adds a new line; the send button sends.
- **Always current.** The shell loads the deployed site (`server.url` in `capacitor.config.json`), so every
  Vercel deploy reaches the app without a new build. `www/` is only an offline fallback message.

## Build for iPhone (needs a Mac with Xcode 16+)

```bash
cd mobile
npm install
npx cap sync ios
npx cap open ios        # opens App.xcodeproj in Xcode
```

In Xcode: select the **App** target → *Signing & Capabilities* → pick your team (a free Apple ID works for
your own phone). Plug in the iPhone, choose it as the run destination, press **Run**. For TestFlight or the
App Store: *Product → Archive*, then *Distribute App*.

The project uses Swift Package Manager (no CocoaPods). The bundle id is `app.immiinsight`; change `appId` in
`capacitor.config.json` and run `npx cap sync` if you need your own.

## Build for Android (Android Studio)

```bash
cd mobile
npm install
npx cap sync android
npx cap open android
```

Then *Run* on a device, or *Build → Generate Signed App Bundle* for the Play Store.

## Changing what the shell loads

`capacitor.config.json` → `server.url`. Point it at a preview deployment to test a branch, then
`npx cap sync`. Supabase sign-in and storage stay inside the app (`allowNavigation`).
