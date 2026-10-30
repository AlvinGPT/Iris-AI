# OCURE_MEDIA.md — clip manifest, assets, adding or replacing clips

## 1. Folder and naming
Put clips and the still in the project's existing static-asset location. Inspect the project to find it; do not assume a path. Create an ocure/clips/ subfolder there (and ocure/posters/ if posters are produced). Final file names are exactly the clip ids below, lowercase, .mp4.

## 2. Manifest (one data module, keyed by clipId)
| clipId | file | shot | durationSeconds | loop |
|---|---|---|---|---|
| idle_loop | idle_loop.mp4 | idle | 8 | yes |
| eyes_blink_complete | eyes_blink_complete.mp4 | eyes_closeup | 8 | yes |
| eyes_closure_rest | eyes_closure_rest.mp4 | eyes_closeup | 8 | yes |
| eyes_horizontal | eyes_horizontal.mp4 | eyes_closeup | 8 | yes |
| eyes_vertical | eyes_vertical.mp4 | eyes_closeup | 8 | yes |
| eyes_diagonal | eyes_diagonal.mp4 | eyes_closeup | 8 | yes |
| face_settle_breathing | face_settle_breathing.mp4 | face_closeup | 8 | yes |
| shoulder_relax | shoulder_relax.mp4 | medium | 8 | yes |
| head_turn_slow | head_turn_slow.mp4 | medium | 8 | yes |
| coach_complete | coach_complete.mp4 | face_closeup | 8 | no |

Each entry: file path, optional poster path, shot, durationSeconds, loop. Read the real duration from file metadata at runtime rather than trusting the number above.
Add a status field (present | missing) computed at build or load time, and list it in the delivery report.

## 3. Posters and still
- Poster = first frame of the clip. If no poster file exists, the video element's own first frame is used. If the video cannot load, use the mascot still.
- Mascot still: a cropped PNG of the open-eyed mascot (ocure/mascot-still.png). Use the supplied asset. Do not redraw or recolor it.
- Optional poster export (run locally): ffmpeg -i <clip>.mp4 -frames:v 1 -q:v 3 <clipId>.jpg

## 4. Constraints
Clips are muted, bundled, and already small (about 1-2.5 MB each). Do not re-encode or resize unless playback fails. Do not add a video library.

## 5. Adding or replacing a clip
Drop the new file with the same clipId name in the folder. No code change needed. A missing file falls back as described in OCURE_ANIMATION.md section 5.
