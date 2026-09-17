# ArchonBrain

A live Three.js simulation connecting a FlyWire v783 connectome-based neural model to a floating virtual body. Source signals enter the neural model; measured outputs influence movement and absorption; changes in position and source energy feed into subsequent inputs.

## Run locally

Use Node.js 22.12+ or 24 and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:5173. The initial download includes a roughly 30 MB neural graph and 31 MB body model. Neural computation runs in the browser using a Web Worker and WebAssembly.

```sh
pnpm build
pnpm preview --port 4173
```

The production output is `dist/`. Hosting must serve its JavaScript modules, WebAssembly and binary assets intact. No application account, backend API, or credentials are required.

## Explore

The default page starts the neural controller with two energy sources.

- Drag **A** or **B** in the scene to change the supplied signals.
- **View all** frames the body and sources and restores source editing.
- **Free view** enables rotation, wheel zoom, and middle-button drag to pan. Source editing is disabled while using this view.
- **Start over** restores the initial arrangement with a fresh neural state.
- Neural activity, the environment map, and remaining energy show the same running experiment.

With reduced motion enabled, use **Start** to begin. The live observation surface has a fixed 1280px layout; smaller windows use horizontal scrolling. The project overview below it adapts to narrower screens.

The separate `/?tools=1` route exposes existing experiment controls: source strength and deletion, Play/Pause, output and directional-input comparisons, Settings, and JSON save/load. Manual **Preview** is a visual motion inspection tool, separate from neural execution. Opening another tab starts a separate session.

Experiment files save starting conditions, including logical pose, source IDs, remaining energy, seed and control settings. Loading initializes a fresh paused brain; it does not restore an ongoing neural state, memory or animation.

## Scope

The sensory-to-neural-to-body feedback loop is implemented. Sensory mappings, motor decoding, contact rules and animation are application logic; not every joint movement emerges from the connectome. The current controller does not learn through repeated runs. Selecting the strongest source, visiting every source, or consuming all available energy is not guaranteed.

See [development and validation](docs/DEVELOPMENT.md) for architecture and test commands, and [assets and attribution](docs/ASSETS.md) for source versions and redistribution status.

## Checks

```sh
pnpm test:unit
pnpm lint
pnpm build
pnpm check:public
pnpm exec playwright test tests/experience-ui.spec.js tests/experiment-ui.spec.js
```

Browser tests execute the actual bundled neural model. See the development guide for browser setup. `check:public` scans the Git publication candidate for common accidental disclosures; it is a heuristic check, not a security or license certification.

## Third-party materials

The neural runtime and data originate from [satorunet/hae](https://github.com/satorunet/hae), with upstream attribution preserved in `public/neural/` and `third_party/hae/`. Original project code is available under the [MIT license](LICENSE). The body model was created by the maintainer using a paid Meshy plan and supplied for this project. It is distributed separately from the code license; see [asset terms](docs/ASSETS.md). Third-party code and data retain their respective licenses.
