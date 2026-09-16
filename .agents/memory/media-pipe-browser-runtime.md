---
name: Browser hand-tracking runtime
description: Environment constraint for the AR hand-tracking prototype
---

The package install path for the MediaPipe Tasks Vision runtime was unavailable in this workspace, so the prototype uses the browser-loadable MediaPipe Hands runtime from jsDelivr instead of bundling it as an npm dependency.

**Why:** This keeps the local camera demo runnable without adding a blocked or unavailable package.

**How to apply:** If replacing the tracker, verify the package firewall and browser bundle behavior first; otherwise preserve the external runtime and keep the inference/render loops separate.

The legacy Hands WASM instance must not be closed while an async `send()` call is still in flight; mark tracking disposed, stop scheduling frames, and close after the active inference settles.

**Why:** Closing the browser-loaded WASM solution during an in-flight frame produced `SolutionWasm instance already deleted` errors during reloads and workflow restarts.

**How to apply:** Keep disposal state separate from the render loop and guard the inference promise whenever changing camera cleanup or hot-reload behavior.