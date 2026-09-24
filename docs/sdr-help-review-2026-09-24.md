# SPECTER SDR online help review, September 24, 2026

Source baseline: `datadrian/specter-sdr` commit `b577b42`, version 1.7.41.
Public release verified through the releases API: v1.7.41, published September 24, 2026.
The release became available during this review; the initial v1.7.40 availability note was replaced before publishing.

## Scope

Reviewed all 18 existing guides plus the Help Center overview. Updated navigation and review/version metadata throughout. Added three guides: Channel Activity Watch, Radiation Counter and Timeline, and What's New and Version Availability. Total: 21 guides plus the overview.

## Source evidence

- `renderer/activity-watch.js`, `renderer/sdr-view-controller.js`, and `main/activity-recorder.js`: RF-based channel detection, 8 dB threshold, 250 ms attack, 2-second default hold, four response settings, approximately 1.5 seconds of available pre-roll, WAV/JSON output and about 10 minutes per capture. Watching is opt-in per receiver; activity sound and recording settings default on.
- `renderer/audio-alerts.js` and `main/index.js`: separate aircraft/severity sounds default off; shared receiver output when running, otherwise a separate default-output audio context; tones bypass receiver master volume.
- `renderer/receiver-onboarding.js` and the RTL EEPROM implementation: new-device naming, supported factory-serial RTL identity workflow, 1-14-character serials, write verification, and unplug/replug after success.
- `scripts/sdr-sidecar.py`, commits `f357ec3` and `d838832`: paused autonomous display between requested scans, completed-response handling, atomic analyzer range application, and range announcements. Reference RBW timing is identified as implementation-documented measurement, not newly reproduced hardware testing.
- `renderer/sdr-view-controller.js`, `renderer/clip-ring.js`, and commit `1ea0d06`: event-clip class and receiver/analyzer eligibility; popup suppression is distinct from evidence eligibility.
- `main/sidecar-log.js`, `renderer/sdr-receiver-workspace.js`, `renderer/instrument-strip.js`: bounded diagnostic logs, mixed-device display ordering, dedicated counter trace and disconnect state.
- `main/license.js` and the current UI: 30 elapsed minutes for the demo; one to six Advanced Display tiles; no 900-point tinySA option.

## Coverage

Getting started, receiver setup, supported radios, tinySA, workstation, visualizers, frequency scanning, IQ/remote receivers, network outputs, Decoder Lab, sensor decoding, research, array setup, recording/alerts, ADS-B, Imaging integration, licensing, and troubleshooting all received review and relevant corrections or cross-links. Stable workflows and validation caveats were retained.

## Validation

- Existing website test suite plus a new help regression test pass.
- All 22 pages checked in Chromium at 1440 and 390 pixels: HTTP success, article presence, images, structured metadata, active navigation, local anchors, no horizontal overflow and no JavaScript page errors.
- Source release facts and public availability checked separately; no installer was built or released by this documentation task.
- Sitemap, clean routes, machine-readable help links, and the anonymous counter's existing known-path allowlist include the new guides. Counter collection behavior and privacy controls are unchanged.
- Existing website download/legal changes from source commit `6a8c178` were fast-forwarded without modification; help publishing must preserve unrelated live files.
