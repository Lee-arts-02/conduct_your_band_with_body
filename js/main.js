import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { POSE_INDICES } from "./config.js";
import { createGestureState, updateGestureState } from "./gestureRules.js";
import {
  startAudio,
  isAudioStarted,
  isPaused,
  setPaused,
  updateFromGestures,
  getDisplayVolume,
  getLayerSummary,
  getPhraseSummary,
} from "./audioEngine.js";
import { softGainIntensity } from "./intensityCurve.js";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const UPPER_EDGES = [
  [POSE_INDICES.LEFT_SHOULDER, POSE_INDICES.RIGHT_SHOULDER],
  [POSE_INDICES.LEFT_SHOULDER, POSE_INDICES.LEFT_ELBOW],
  [POSE_INDICES.LEFT_ELBOW, POSE_INDICES.LEFT_WRIST],
  [POSE_INDICES.RIGHT_SHOULDER, POSE_INDICES.RIGHT_ELBOW],
  [POSE_INDICES.RIGHT_ELBOW, POSE_INDICES.RIGHT_WRIST],
];

const UPPER_POINTS = [
  POSE_INDICES.LEFT_SHOULDER,
  POSE_INDICES.RIGHT_SHOULDER,
  POSE_INDICES.LEFT_ELBOW,
  POSE_INDICES.RIGHT_ELBOW,
  POSE_INDICES.LEFT_WRIST,
  POSE_INDICES.RIGHT_WRIST,
];

const welcome = document.getElementById("welcome");
const sessionRoot = document.getElementById("sessionRoot");
const btnWelcomeStart = document.getElementById("btnWelcomeStart");
const btnPause = document.getElementById("btnPause");
const btnShowInstructions = document.getElementById("btnShowInstructions");
const instructionsModal = document.getElementById("instructionsModal");
const instructionsBackdrop = document.getElementById("instructionsBackdrop");
const btnCloseInstructions = document.getElementById("btnCloseInstructions");

const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const chkLandmarks = document.getElementById("chkLandmarks");

const hintBar = document.getElementById("hintBar");
const intensityPanel = document.getElementById("intensityPanel");
const intensityFill = document.getElementById("intensityFill");
const intensityReadout = document.getElementById("intensityReadout");
const intensityBand = document.getElementById("intensityBand");
const intensityTrack = document.getElementById("intensityTrack");

const hudStatus = document.getElementById("hudStatus");
const hudLeftHand = document.getElementById("hudLeftHand");
const hudRightHand = document.getElementById("hudRightHand");
const hudWave = document.getElementById("hudWave");
const meterL = document.getElementById("meterL");
const meterR = document.getElementById("meterR");
const hudGesture = document.getElementById("hudGesture");
const hudLayers = document.getElementById("hudLayers");
const hudPhrases = document.getElementById("hudPhrases");

let poseLandmarker = null;
let running = false;
let lastVideoTime = -1;
const gestureState = createGestureState();

function intensityBandLabel(t) {
  if (t < 0.34) return "Soft";
  if (t < 0.67) return "Medium";
  return "Strong";
}

function isGestureMusical(o) {
  if (!o) return false;
  return (
    o.armsOpen ||
    o.leftUp ||
    o.rightUp ||
    o.bothUp ||
    o.bothDown
  );
}

function setGlow(active) {
  hintBar.classList.toggle("is-glow", active);
  intensityPanel.classList.toggle("is-glow", active);
}

async function createPoseLandmarker() {
  const wasm = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  const tryCreate = async (delegate) => {
    return PoseLandmarker.createFromOptions(wasm, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate,
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
  };

  try {
    return await tryCreate("GPU");
  } catch (e) {
    console.warn("GPU delegate failed, using CPU", e);
    return await tryCreate("CPU");
  }
}

function resizeCanvas() {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;
  canvas.width = w;
  canvas.height = h;
}

function drawLandmarks(landmarks) {
  if (!chkLandmarks.checked || !landmarks?.length) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(110, 231, 183, 0.85)";
  ctx.fillStyle = "rgba(125, 211, 252, 0.95)";

  for (const [a, b] of UPPER_EDGES) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height);
    ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height);
    ctx.stroke();
  }

  for (const i of UPPER_POINTS) {
    const p = landmarks[i];
    if (!p) continue;
    const x = p.x * canvas.width;
    const y = p.y * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function refreshHudStatus() {
  if (!isAudioStarted()) {
    hudStatus.textContent = "idle";
    return;
  }
  hudStatus.textContent = isPaused() ? "paused" : "live";
}

function openInstructions() {
  instructionsModal.hidden = false;
  instructionsModal.setAttribute("aria-hidden", "false");
}

function closeInstructions() {
  instructionsModal.hidden = true;
  instructionsModal.setAttribute("aria-hidden", "true");
}

function tick() {
  if (!running || !poseLandmarker) {
    return;
  }

  const t = video.currentTime;
  if (t === lastVideoTime) {
    requestAnimationFrame(tick);
    return;
  }
  lastVideoTime = t;

  resizeCanvas();

  const result = poseLandmarker.detectForVideo(video, performance.now());
  const landmarks = result?.landmarks?.[0] ?? null;

  const {
    output,
    label,
    intensity,
    leftIntensity,
    rightIntensity,
    wave,
  } = updateGestureState(gestureState, landmarks);

  if (isAudioStarted()) {
    updateFromGestures(output, intensity, leftIntensity, rightIntensity, wave);
  }

  drawLandmarks(landmarks);

  const pct = getDisplayVolume(intensity);
  const ti = typeof intensity === "number" ? intensity : 0;
  const li = typeof leftIntensity === "number" ? leftIntensity : 0;
  const ri = typeof rightIntensity === "number" ? rightIntensity : 0;

  intensityFill.style.width = `${pct}%`;
  intensityReadout.textContent = `${pct}%`;
  intensityBand.textContent = intensityBandLabel(ti);
  if (intensityTrack) {
    intensityTrack.setAttribute("aria-valuenow", String(pct));
  }

  if (meterL) {
    meterL.style.width = `${Math.round(softGainIntensity(li) * 100)}%`;
  }
  if (meterR) {
    meterR.style.width = `${Math.round(softGainIntensity(ri) * 100)}%`;
  }

  const melOn = output && (output.leftUp || output.armsOpen);
  const rhyOn = output && output.rightUp;
  hudLeftHand.textContent = melOn ? "Melody active" : "Idle";
  hudRightHand.textContent = rhyOn ? "Rhythm active" : "Idle";

  if (hudWave && wave) {
    const lW = wave.left?.isWaving;
    const rW = wave.right?.isWaving;
    if (lW && rW) hudWave.textContent = "Both waving";
    else if (lW) hudWave.textContent = "Left waving";
    else if (rW) hudWave.textContent = "Right waving";
    else hudWave.textContent = "—";
  }

  setGlow(isGestureMusical(output));

  hudGesture.textContent = label;
  hudLayers.textContent = isAudioStarted() ? getLayerSummary(output) : "—";
  hudPhrases.textContent = isAudioStarted() ? getPhraseSummary() : "—";
  refreshHudStatus();

  requestAnimationFrame(tick);
}

async function onStartSession() {
  btnWelcomeStart.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    });
    video.srcObject = stream;
    await video.play();

    poseLandmarker = await createPoseLandmarker();
    await startAudio();

    running = true;
    sessionRoot.classList.remove("session-root--hidden");
    welcome.classList.add("welcome--away");
    welcome.setAttribute("aria-hidden", "true");

    btnPause.disabled = false;
    refreshHudStatus();
    requestAnimationFrame(tick);
  } catch (err) {
    console.error(err);
    btnWelcomeStart.disabled = false;
    alert(`Could not start: ${err.message || String(err)}`);
  }
}

function onPauseToggle() {
  if (!isAudioStarted()) return;
  const next = !isPaused();
  setPaused(next);
  btnPause.textContent = next ? "Resume" : "Pause";
  refreshHudStatus();
}

btnWelcomeStart.addEventListener("click", onStartSession);
btnPause.addEventListener("click", onPauseToggle);
btnShowInstructions.addEventListener("click", openInstructions);
btnCloseInstructions.addEventListener("click", closeInstructions);
instructionsBackdrop.addEventListener("click", closeInstructions);

chkLandmarks.addEventListener("change", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

video.addEventListener("loadeddata", resizeCanvas);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !instructionsModal.hidden) {
    closeInstructions();
  }
});
