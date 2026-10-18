# Real fox motion laboratory

This local experiment extracts 17 estimated two-dimensional joints from nine seconds of real fox footage. The supplied fox game still uses its existing Mesh2Motion animation clips. The experiment is an inspectable path toward video-derived movement, not a claim that a new pose network, physical locomotion controller, or three-dimensional motion-capture system has been trained.

## Current result

`output/real-animal-v2` contains 225 inferred frames, the original confidence values and masks, four fitted timing regressions, and a source-overlay video. **The cadence profile is blocked.** None of the four paw signals met all of the predeclared held-out stability checks. The real fox changes pose and pace, and grass obscures feet; a fixed cadence with two harmonics is an inadequate explanation of this clip.

The game must not apply the rejected fitted frequencies. `profile.json` therefore has `status: blocked`, `speedScale: null` and `enabledByDefault: false`. A future passing profile would still require explicit opt-in, visual inspection and a separate evaluation clip. Changing a video crop or fitting method after seeing results does not make the same clip independent validation.

## Review files

- `poses.json`: image-space points, response scores, confidence masks, timestamps and pinned source hashes.
- `profile.json`: compact playback-admission status. Only optional clip timing is in scope; no new bone rotations or foot contacts are supplied.
- `report.json`: per-paw training and holdout errors, constant-baseline comparison and thresholds.
- `pose-overlay-web.mp4`: browser-friendly H.264, 1280 by 720, 25 fps, 225 frames, 9 seconds. No audio.
- `overlay-*.jpg`: five sampled frames for checking animal alignment and occlusion.
- `source-manifest.json` in this folder: source video, model, licenses, attribution and exact hashes.

The five sampled overlays show the estimated skeleton broadly following the visible animal. Near and far paws overlap, some ankle estimates lie in grass, and left-right limb identity is not independently labeled. High model response is not proof of anatomically correct tracking. The overlay is a diagnostic, not cleaned animation data.

## Reproduce

Use Python 3.12 or a compatible environment. Dependencies are isolated in `.venv`; no global Python packages were changed.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s . -p "test_*.py" -v
.\.venv\Scripts\python.exe infer_motion.py --video sources/fox-walk-22-31.mp4 --model models/rtmpose-ap10k/20230831/rtmpose_onnx/rtmpose-m_simcc-ap10k_pt-aic-coco_210e-256x256-7a041aa1_20230206/end2end.onnx --source-manifest source-manifest.json --bbox-keyframes fox-bbox-keyframes.json --duration 9 --sample-fps 25 --output output/new-run
```

Outputs must be new or empty directories. Existing run receipts are not overwritten. The source files and ONNX checkpoint must match their provenance manifest before inference starts. The estimator does not download material or use an external API.

The actual ONNX tensor is 256 by 256. Some accompanying deployment metadata says 192 by 256; the adapter checks the real tensor rather than accepting that stale entry. Input is padded and cropped, converted from BGR to RGB, normalized with the published ImageNet channel constants, then decoded from SimCC coordinates back into original video pixels. The bounding boxes are manually supplied coarse tracking regions, not the output of an animal detector.

## Timing fit and admission checks

Each paw uses horizontal image position relative to torso center, normalized by median visible torso length. This removes translation but cannot recover perspective, camera scale or depth. No metres-per-second measurement is claimed.

Model responses below 0.40 are masked. Short local median smoothing never fills missing observations and does not cross the training and holdout boundary. The first 70 percent of frames select a frequency and two-harmonic least-squares coefficients. The last 30 percent evaluate prediction error without tuning those parameters.

A usable timing profile requires at least five seconds, three observed cycles, 70 percent joint coverage, at least two passing paw signals, normalized holdout error at most 0.85, at least 15 percent improvement over a constant prediction, and cross-paw frequency agreement within 20 percent. These are project screening thresholds, not biological confidence intervals. The optional speed multiplier is clamped to 0.75 through 1.35 against an explicitly authored reference cadence, not a claimed measurement of the source rig clip.

## Provenance and rights

Footage: Lubo Ondrasko, *Red fox (Vulpes vulpes) looking for a mouse* (2014), via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Red_fox_(Vulpes_vulpes)_looking_for_a_mouse.webm), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The excerpt is muted, transcoded and overlaid with estimated points. Keep attribution with derivatives; the creator does not endorse this project.

The pretrained model and preprocessing are documented by [RTMLib](https://github.com/Tau-J/rtmlib) and the [OpenMMLab RTMPose AP10K configuration](https://github.com/open-mmlab/mmpose/blob/main/projects/rtmpose/rtmpose/animal_2d_keypoint/rtmpose-m_8xb64-210e_ap10k-256x256.py). Joint names follow the [official AP10K configuration](https://github.com/open-mmlab/mmpose/blob/main/configs/_base_/datasets/ap10k.py). Model, code and dataset declarations are recorded separately in the manifest. No AP10K training dataset was downloaded.

Exclude `.venv`, model archives and unverified example images bundled with third-party weights from a browser game release. The game only needs the small evidence profile and optionally the attributed source/overlay for its local inspector. Use the full lab folder locally to rerun inference.
