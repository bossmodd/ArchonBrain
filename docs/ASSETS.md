# Assets and attribution

## Neural runtime and graph

- Source: https://github.com/satorunet/hae
- Pinned commit: `3625e01b09e5960a54722143ea03e67c845b88bb`
- Upstream model: https://github.com/philshiu/Drosophila_brain_model
- Model paper: https://doi.org/10.1038/s41586-024-07763-9
- Dataset: FlyWire v783.
- Upstream runtime license: MIT; full notice retained in `public/neural/LICENSE-hae` and `third_party/hae/LICENSE`.
- Dataset license recorded by the upstream project: CC BY 4.0.
- Attribution: FlyWire Consortium; Dorkenwald, Matsliah et al. (2024); cell annotations: Schlegel et al. (2024).

Exact asset URLs, hashes, mapping notes and application changes are recorded in `public/neural/provenance.json` and `public/neural/atlas-provenance.json`. The adapter uses a fixed stabilization list and no learned weights. Upstream source is retained unchanged.

## Body model

`public/models/archon-rigged.glb` was created by the maintainer using a paid Meshy plan and supplied for inclusion in this public project. Its source is documented based on the maintainer's confirmation. The model is not covered by the project's MIT code license: it is provided for running and demonstrating ArchonBrain; no separate asset reuse license is granted here.

[Meshy's ownership guidance](https://help.meshy.ai/en/articles/10137554-what-is-the-ownership-of-the-generated-models) describes paid-plan output ownership subject to its conditions, including rights in uploaded source materials. This record does not grant rights to third-party names, characters or reference artwork. The model bytes remain unchanged.

## Visual references

Supplied screenshots and sprite references were development references, not runtime dependencies. They remain in ignored local documentation and are excluded from the public asset directory and production build. This project does not claim ownership of those reference images or of StarCraft-related names or designs.

## Icons and dependencies

Inline icons use Lucide paths (ISC license); see `third_party/lucide/LICENSE`. Three.js (MIT), lil-gui (MIT), and other package dependencies retain their own package licenses. No third-party attribution has been removed as part of cleanup.

## Header portrait

`public/images/archon-icon.png` is the static Archon portrait supplied by the maintainer for the app icon, header and README. It is fan-project artwork/reference material, not original MIT-licensed code. StarCraft-related characters and imagery retain their respective rights holders' rights; inclusion here does not grant a separate reuse license. The project's non-commercial fan-made purpose is an intent statement, not a claim of official affiliation or permission from Blizzard Entertainment.
