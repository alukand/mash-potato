# App icon / splash source

`icon.svg` is the branded 1024×1024 app icon (opaque background — iOS rounds the
corners itself). To regenerate the native icon + splash sets:

1. Rasterize to a 1024×1024 PNG at `resources/icon.png`, e.g.:
   - Inkscape: `inkscape resources/icon.svg -w 1024 -h 1024 -o resources/icon.png`
   - librsvg:  `rsvg-convert -w 1024 -h 1024 resources/icon.svg -o resources/icon.png`
   - or open `icon.svg` in a browser and export/screenshot at 1024².
2. (Optional) add `resources/splash.png` (2732×2732, logo centered on `#15121B`).
3. Generate the native assets:
   ```
   npx @capacitor/assets generate --ios --android
   ```

Until this is run, the app ships Capacitor's default icon — uploadable, just
unbranded.
