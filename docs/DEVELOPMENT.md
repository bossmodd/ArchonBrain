# Development

## Structure

- `src/neural/`: WebAssembly model wrapper, worker, sensory mapping, motor decoding, environment feedback, timing, and experiment files.
- `src/archon/`: body mesh, articulated interaction poses, eye attachments, gas, electrical effects and satellites.
- `src/scene/`: camera, display interpolation, floor, lighting and manual Preview.
- `src/ui/`: public observation page, detailed tools, source editing, map and project overview.
- `public/neural/`: pinned neural runtime/data and attribution manifests.
- `third_party/hae/`: pinned upstream source retained for reproducibility and mapping audits. Preserve its copyright notices.
- `tests/`: unit, real-model, browser and rendering regression checks.
- `scripts/`: verification, diagnostics, provenance audits and build-time compatibility hashing.

The neural/environment window is 100 ms of simulation time. Rendering interpolates confirmed states and does not advance the neural model. Output-disconnection and directional-input controls support causal comparisons. Target information used to attach effects is distinct from the motor decoder.

The experiment compatibility identifier hashes model files and relevant behavior code. Do not alter those files merely to restyle the UI or clean documentation: doing so changes saved-file compatibility.

## Browser setup

```sh
pnpm exec playwright install chromium
pnpm exec playwright test
```

Playwright uses installed Google Chrome on macOS when available, otherwise its bundled Chromium. `CHROME_PATH` can select another executable. The test configuration starts or reuses the local Vite server. Some standalone historical verification scripts explicitly use macOS Chrome; inspect their prerequisites before running them elsewhere.

Long-running approach, two-source and continuous-use scripts are separate from routine layout verification. Retained JSON fixtures under `docs/neural/` and `docs/first-experience/` are inputs to those scripts, not credentials or application state. The full two-source trace is kept because the view regression compares per-window outputs, positions and remaining energy against it. Generated screenshots, recordings, logs, reports and historical working notes are ignored by Git.

Production output should be served by a static host. Vite's development and preview servers are local tools, not the planned production hosting configuration. Railway configuration is not part of this cleanup.

## Public repository preparation

`pnpm check:public` scans tracked and unignored files for Hangul source text, personal absolute paths, common credential signatures and oversized files. Intentional international-name tests use Unicode escapes to retain coverage without non-English source copy. The scan never prints credential values.

Ignored working files remain on disk. Do not use `git add -f` or publish a whole workspace ZIP: doing so bypasses the publication exclusions. Before the first push, review the staged file list and review asset terms and the MIT license for original code. No remote or account is configured by these scripts.
