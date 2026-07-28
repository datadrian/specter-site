# SPECTER Marketing Splash Page & SEO Changelog

This document tracks the updates made to `/tmp/specter-site/public/index.html` (Version `12.40.0`) in place.

---

## 1. SEO & Metadata Refresh (Head Section)
* **Title Updated**: Set to `SPECTER | Ghost Hunting Software, SLS Camera & Paranormal Investigation App` for maximum keyword relevance.
* **Meta Description Updated**: Rewritten to emphasize the full feature set: SLS tracking, 3D point clouds, EVP spectrogram lab, 8-camera IP wall, EMF node, live depth tuning, and remote phone alerts with automatic evidence archive.
* **Meta Keywords Updated**: Expanded to capture relevant terms: `ghost hunting software, SLS camera, paranormal investigation software, EVP, thermal ghost detection, ghost detection app, SLS skeleton tracker, Kinect SLS software, RealSense ghost hunting, 8-camera IP wall, EMF node, 3D spatial capture, phone detection alerts, evidence archive, SPECTER paranormal`.
* **Open Graph (og:title, og:description) & Twitter Card Metadata**: Aligned with the updated SEO description and keyword set.
* **JSON-LD Schema Added/Updated**: Infused `"softwareVersion": "12.40.0"` and aligned the software description with the enhanced feature list (operatingSystem: `Windows`, applicationCategory: `Paranormal investigation software`, offers.price: `399`).

---

## 2. Feature Grid Additions & Expansions (Lines 169–340)
The features grid has been expanded from 11 cards to **18 cards** to reflect newly shipped capabilities, using the existing layout structure, styles, and high-tech icons:
1. **ANOMALY INDEX** *(Existing)*: Environmental sensor fusion.
2. **SLS NEURAL ENTITY TRACKING** *(Existing)*: Machine learning keypoint mapping.
3. **RGB-D SPATIAL CAPTURE** *(Existing)*: 3D data embedding on evidence snapshots.
4. **FIELD DISTURBANCE VECTOR** *(Existing)*: Frame-wide dense optical flow.
5. **RESIDUAL COHERENCE MONITOR** *(Existing)*: Baseline shift tracking.
6. **AUTONOMOUS EVIDENCE ARCHIVE** *(Expanded)*: Now highlights the **global timecode stamped** directly into all captured evidence files.
7. **THERMAL CONTROL CENTER** *(Existing)*: P2W camera integration.
8. **EVP AUDIO LAB** *(Expanded)*: Added references to **running timecode, live spectrogram/waveform playback, and camera cycling**.
9. **REMOTE FIELD TOOLS** *(Existing)*: QR-code phone portal.
10. **8-CAMERA IP WALL** *(Expanded from 4-camera placeholder)*: Expanded to feature up to **8 security cameras** with selectable grid layouts (**1x1/2x2/3x2/4x2/3x3**), live per-camera thumbnails, and real-time detection on every channel.
11. **DETECTION ALERTS TO YOUR PHONE** *(Existing)*: Remote background alerts.
12. **LIVE DEPTH TUNING** *(New Feature Card)*: Ability to adjust depth filtering, range, and quality thresholds in real time without restarting the session.
13. **3D EVIDENCE VIEWER** *(New Feature Card)*: Interactive point-cloud review inside the gallery with adjustable **brightness GAIN and range controls**.
14. **PER-FEED DETECTOR TOGGLES** *(New Feature Card)*: Dedicated toggles to enable/disable specific detectors independently for each camera feed.
15. **EVIDENCE GALLERY** *(New Feature Card)*: Built-in suite showing per-feed thumbnail sources with **depth brightness gain** controls.
16. **RECORDING TIERS & CLIPS** *(New Feature Card)*: Support for Broadcast vs. Ultra recording tiers and automated **20-second detection clips with pre-roll/post-roll** buffers.
17. **ROOM MAP RECONSTRUCTION** *(New Feature Card)*: Real-time physical mapping and continuous spatial mesh reconstruction of the investigation room.
18. **DETECTION CLASSIFICATIONS** *(New Feature Card)*: Highlights the ten advanced classifications: `SPECTRAL ANOMALY`, `ORB`, `COLD SPOT`, `PARTIAL APPARITION`, `VAPOR ANOMALY`, `CHROMATIC SIGNATURE`, `ENERGY VORTEX`, `DISEMBODIED FACE`, `FACIAL ANOMALY`, and `HUMANOID FIGURE`.

---

## 3. Strict Compliance & Terminology Fixes
* **Forbidden terms removed**:
  * Scanned and verified that **no references** to `ghost/injection`, `producer/talent tools`, `secret menu`, `profile injection`, `session arcs/auto-hits`, `node/field driver`, or `/p/` exist.
  * Replaced **"PIN gated"** with **"passcode gated"** in the remote internet monitoring description to comply with the prohibition of the word `PIN`.
  * Checked and confirmed that the word **"talent"** is completely absent from the file.

---

## 4. Screenshot Asset Requests & Specifications
Here are the 5 screenshot references embedded in the HTML, along with exactly what they must showcase in the final live deploy:

1. **`/assets/screenshots/specter-identify.png`** (Hero image & Field Interface section)
   * **Visual Spec**: Show the main SPECTER UI in a dark room. Overlay the neural identification bounding boxes highlighting furniture (e.g. chairs, plants) with confidence percentages. The rolling "Anomaly Index" graph should be active on the side panel.
2. **`/assets/screenshots/specter-anomaly-rgb.png`** (Live View Modes grid)
   * **Visual Spec**: Show the standard high-resolution RGB camera view with an active, red/green glowing wireframe overlay displaying the real-time Anomaly Index readings on screen.
3. **`/assets/screenshots/specter-depth-blend.png`** (Live View Modes grid & Field Interface section)
   * **Visual Spec**: Show a false-color thermal-style representation of depth data (blues to reds) overlaid directly on top of the live physical scene, highlighting temperature or proximity gradients.
4. **`/assets/screenshots/specter-point-cloud.png`** (Live View Modes grid & Field Interface section)
   * **Visual Spec**: Show a dense, neon cyan-on-black 3D point cloud of a scanned room. Visual elements should show a human figure shape in the geometry, proving spatial evidence.
5. **`/assets/screenshots/specter-depth-3d.png`** (Live View Modes grid)
   * **Visual Spec**: Show a full, solid-mesh 3D wireframe reconstruction of the environment, representing the spatial tracking mapping.

---

## 5. Em-Dash (—) and HTML `&mdash;` Compliance Check
* **Final Scan Result**: **ZERO (0)** em-dash characters or `&mdash;` codes are present in the updated file. All dashes have been replaced with regular hyphens or standard phrase structures.
