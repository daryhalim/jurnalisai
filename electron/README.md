# Jurnalis.AI — Desktop App 🖥️

Versi desktop dari [Jurnalis.AI](https://jurnalisai.netlify.app) dengan **proteksi anti-screenshot 100%** menggunakan Electron Content Protection DRM.

## ✨ Fitur Desktop Eksklusif

| Fitur | Web | Desktop |
|---|---|---|
| Anti-Copy/Paste | ✅ | ✅ |
| Anti-Print | ✅ | ✅ |
| Anti-Screenshot | ⚠️ ~70% | ✅ **100%** |
| Anti-Screen Recording | ❌ | ✅ **100%** |
| Anti-Screen Sharing | ❌ | ✅ **100%** |

## 🚀 Cara Menjalankan (Development)

```bash
cd electron
npm install
npm start
```

## 📦 Build untuk Distribusi

### macOS (.dmg)
```bash
npm run build:mac
```

### Windows (.exe)
```bash
npm run build:win
```

### Semua platform
```bash
npm run build:all
```

File hasil build akan tersedia di folder `electron/dist/`.

## 🔒 Bagaimana Anti-Screenshot Bekerja?

Desktop app menggunakan Electron API `setContentProtection(true)` yang memanfaatkan fitur keamanan bawaan OS:

- **macOS**: Menggunakan `NSWindow.sharingType = .none` — window secara fisik tidak bisa ditangkap oleh screencapture, QuickTime, atau screen sharing
- **Windows**: Menggunakan `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` — window disembunyikan dari semua capture API

Ini adalah **proteksi level OS**, bukan JavaScript trick — sehingga **100% efektif** dan tidak bisa dibypass oleh user biasa.

## 📁 Struktur File

```
electron/
├── main.js          # Main process (window + DRM)
├── preload.js       # Preload script (bridge API)
├── package.json     # Dependencies & build config
├── icons/
│   └── icon.png     # App icon
└── dist/            # Build output (setelah build)
```
