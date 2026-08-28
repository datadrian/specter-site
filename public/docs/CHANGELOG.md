# SPECTER, What's New

_Operator-facing changelog. June 2026._

## Depth & 3D
- **3D depth field view (DEPTH_3D)**, full-screen orbitable point cloud from the depth sensor. Drag to rotate, scroll to zoom, right-click to pan.
- **RANGE control**, one slider maps the full scene from near to far. Center auto-fits everything the sensor sees.
- **DEPTH COLOR**, toggle false-color depth (distance = color) vs mono grey shading. Color always represents distance, not a camera overlay.
- **Saved viewpoint**, store your preferred 3D camera angle; the app restores it on next launch.
- **Stabilized depth range**, per-frame sampling plus smoothing eliminates flicker in live depth views.

## Gallery
- **RGB / DEPTH / 3D layer bar** on the fullscreen detection viewer.
- **DEPTH layer** re-renders from raw sensor data, RANGE and DEPTH COLOR work on both mono and false-color.
- **3D depth modal**, orbitable point cloud saved at detection time, with HEAT / MONO / RGB and SAVE NEW.
- **Save view**, exports `gallery_view_NN.png` plus a JSON sidecar (layer, filters, range, color mode, bbox).
- **Save as new version**, flattened `snapshot_edited_NN.png` export.
- Card badges: **D** (2D depth heatmap saved) and **3D** (orbitable depth snapshot saved).

## Recording
- Sessions record to **MP4 (H.264)** with optimized bitrates for smaller files.
- **Transcode progress bar** appears if a temporary fallback capture must convert to MP4.
- **F9** toggles recording.

## Performance
- **Performance presets:** Light (depth-only), Balanced (default), Show (full quality + 3D views and depth blend in the view cycle).

## Licensed sessions
- **No time limit:** run sessions of any length, with no DEMO MODE countdown.
- Detector behavior is governed entirely by your **Settings** thresholds on the live sensor feed.

## Demo & licensing
- **10-minute demo** per machine install, full UI.
- **$199** one-time license per machine unlocks unlimited sessions and the licensed session program.
