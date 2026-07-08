# SPECTER Node firmware - OTA channel

This folder is published **automatically** by the firmware repo's CI
(`datadrian/specter-node-firmware` → `.github/workflows/build-and-publish.yml`).

- `latest.json` - the update manifest the field nodes poll from their config page.
- `SPECTER-Node-<version>.bin` - the compiled firmware image the node downloads and flashes.

Do not edit these by hand. Push firmware changes to the firmware repo's `main`
branch and CI compiles the `.bin`, writes the manifest, and commits it here.
Netlify then serves it at `https://specter-imaging.com/firmware/node/`.
