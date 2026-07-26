# Plan: DirectDrop — Serverless P2P File Transfer

## What we're building
A single-page web app that lets you transfer files directly between any two devices (PC, Mac, Android, iPhone/iPad) without uploading anything to a server or database. The app runs as a static site and uses WebRTC for peer-to-peer data transfer. Devices find each other by scanning QR codes, so no backend or signaling server is required.

## How it works
```text
Device A (Sender)                Device B (Receiver)
     |                                   |
     |  1. Select file(s)                |
     |  2. Generate WebRTC offer        |
     |  3. Show offer as QR code  ---->  |  4. Scan QR, create answer
     |                                   |
     |  5. Scan answer QR  <------------  |  6. Show answer as QR code
     |                                   |
     |  7. Direct P2P connection established via STUN |
     |  8. Send file(s) directly  ---->  |  9. Receive & download
```

## Key technical decisions

### 1. No backend, no database
- No Firebase, Supabase, or custom server.
- No file is ever stored online.
- Signaling is done manually via QR codes to avoid any third-party relay.

### 2. WebRTC for peer-to-peer transfer
- Use the browser's built-in `RTCPeerConnection` + `RTCDataChannel`.
- Chunk large files (e.g., 16–64 KB chunks) for reliable delivery and progress tracking.
- Use free public STUN servers (Google) for NAT traversal.
- Optional: detect when a TURN relay might be needed and show a helpful message.

### 3. QR-code signaling
- Encode the WebRTC offer as a QR code on the sender.
- Receiver scans it, generates an answer, shows answer as QR.
- Sender scans answer, connection is established.
- QR codes contain compressed JSON (offer/answer + ICE candidates).

### 4. Static hosting on GitHub Pages
- Pure frontend app built with React + TanStack Start.
- Deployable to GitHub Pages or any static host.
- Works offline after initial load (service worker optional, nice-to-have).

## User flow
1. Open the app on both devices.
2. One taps "Send", the other taps "Receive".
3. Sender selects file(s).
4. Sender shows QR code; receiver scans it.
5. Receiver shows QR code; sender scans it.
6. Connection established — transfer begins automatically.
7. Receiver gets a download prompt when complete.

## Features in scope
- Send single or multiple files.
- Transfer progress bar on both sides.
- Simple status messages ("Scan this code", "Connecting...", "Transferring...", "Done").
- Basic error handling (connection failed, QR parse error, etc.).
- Responsive UI for phones, tablets, and desktops.

## Features out of scope for first version
- Background transfer on iOS (Safari limitation, not feasible).
- TURN relay server setup (we'll warn if needed, not build it).
- End-to-end encryption beyond WebRTC's built-in DTLS (can be added later).

## Tech stack
- React 19 + TanStack Start (matches project template).
- Tailwind CSS v4 for styling.
- `qrcode` library for QR generation.
- `jsqr` or `zxing-browser` for QR scanning via camera.
- Native WebRTC APIs (`RTCPeerConnection`, `RTCDataChannel`).

## File structure
```text
src/
├── routes/
│   ├── __root.tsx          # Root layout + meta tags
│   └── index.tsx           # Main app page (send/receive flow)
├── components/
│   ├── SendFlow.tsx        # Sender UI + QR generation
│   ├── ReceiveFlow.tsx     # Receiver UI + QR scanning
│   ├── QRScanner.tsx       # Camera-based QR scanner
│   ├── QRCodeDisplay.tsx   # Render QR code
│   └── TransferProgress.tsx # Progress bars/status
├── lib/
│   └── webrtc.ts           # WebRTC connection + file transfer logic
└── styles.css              # Tailwind theme tokens
```

## Risks & mitigations
| Risk | Mitigation |
|------|------------|
| iOS Safari must stay foreground | Document limitation in UI |
| Strict NAT/firewalls block P2P | Use STUN; show message if TURN needed |
| Large QR codes from big offers | Compress JSON, split ICE candidates if needed |
| QR scanning is awkward | Keep flow minimal; allow copy-paste fallback |

## Success criteria
- Two devices on the same network can transfer a file with only QR scanning.
- No data touches any server or database.
- App builds and runs as a static site on GitHub Pages.
