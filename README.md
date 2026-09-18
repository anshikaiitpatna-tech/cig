AR Hand Motion Lab

A browser-based AR experiment. MediaPipe tracks your hand through the webcam in real time, and a stylized object is anchored to your fingers with physics-based motion. No app install, no server round-trip, everything runs locally in the browser.

What it does

Real-time hand tracking via MediaPipe Hands, running entirely client-side
Gesture recognition, open palm, pinch, hold, wave, and a bring-to-lips gesture, drives what's rendered
Physics-based object anchoring, the object follows your hand with momentum and settle, not a rigid snap
Canvas-based particle effects, smoke and puff clouds, layered on top of the video feed with gradient and blend-mode rendering
Debug overlay for inspecting raw landmark tracking

Stack

React 19, Vite, TypeScript, Tailwind, MediaPipe Hands loaded from CDN, HTML canvas for all effects rendering

Running locally

pnpm install
pnpm --filter @workspace/ar-hand-motion-lab run dev

Needs PORT and BASE_PATH env vars set, for example PORT=5173 BASE_PATH=/

Building

pnpm --filter @workspace/ar-hand-motion-lab run build

Outputs a static site to dist/public, deployable to any static host like Vercel, Netlify, or GitHub Pages.

Notes

Camera access is required and never leaves the browser, no video or frame data is uploaded anywhere. All hand tracking and rendering happens on-device.
