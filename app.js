import { getSurprisePhoto, saveReactionClip } from "./storage.js";
import { isSupabaseConfigured } from "./supabase.js";

const consentCheckbox = document.querySelector("#consentCheckbox");
const dialogConsentCheckbox = document.querySelector("#dialogConsentCheckbox");
const continueButton = document.querySelector("#continueButton");
const declineButton = document.querySelector("#declineButton");
const consentDialog = document.querySelector("#consentDialog");
const openButton = document.querySelector("#openButton");
const lockButton = document.querySelector("#lockButton");
const lockedView = document.querySelector("#lockedView");
const revealedView = document.querySelector("#revealedView");
const surpriseImage = document.querySelector("#surpriseImage");
const photoPlaceholder = document.querySelector("#photoPlaceholder");
const recordingBadge = document.querySelector("#recordingBadge");
const recordingLabel = document.querySelector("#recordingLabel");
const countdown = document.querySelector("#countdown");
const statusMessage = document.querySelector("#statusMessage");

const RECORDING_DURATION_MS = 10_000;

let recorder;
let activeStream;
let recordingTimer;
let countdownTimer;
let recordingStartedAt;
let consented = false;
let finishingRecording = false;
let discardRecording = false;

if (window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/")) {
  window.location.replace("/admin/");
}

function setStatus(message, kind = "") {
  statusMessage.textContent = message;
  if (kind) {
    statusMessage.dataset.kind = kind;
  } else {
    delete statusMessage.dataset.kind;
  }
}

function getRecordingOptions() {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType } : undefined;
}

function lockSurprise(message) {
  window.clearTimeout(recordingTimer);
  window.clearInterval(countdownTimer);
  lockedView.hidden = false;
  revealedView.hidden = true;
  recordingBadge.hidden = true;
  openButton.hidden = false;
  lockButton.hidden = true;
  openButton.disabled = !consented || finishingRecording || !isSupabaseConfigured;
  if (message) setStatus(message);
}

function finishRecording(message) {
  if (!recorder || recorder.state === "inactive" || finishingRecording) return;
  finishingRecording = true;
  window.clearTimeout(recordingTimer);
  window.clearInterval(countdownTimer);
  if (message) setStatus(message);
  recorder.stop();
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = undefined;
  }
}

function startCountdown() {
  const update = () => {
    const remaining = Math.max(
      0,
      Math.ceil((RECORDING_DURATION_MS - (Date.now() - recordingStartedAt)) / 1000),
    );
    countdown.textContent = String(remaining);
    if (remaining === 0) {
      finishRecording();
    }
  };

  update();
  countdownTimer = window.setInterval(update, 200);
  recordingTimer = window.setTimeout(() => finishRecording(), RECORDING_DURATION_MS);
}

async function openSurprise() {
  if (!consented || recorder || finishingRecording) return;
  if (!isSupabaseConfigured) {
    setStatus("Cloud storage isn't configured yet. Please contact the site admin.", "error");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus("This browser can't record video. Please try a recent browser over HTTPS.", "error");
    return;
  }

  openButton.disabled = true;
  setStatus("Waiting for camera and microphone permission…");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: "user" },
    });

    if (!consented) {
      stream.getTracks().forEach((track) => track.stop());
      openButton.disabled = !isSupabaseConfigured;
      return;
    }

    activeStream = stream;
    const options = getRecordingOptions();
    recorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("error", () => {
      finishingRecording = false;
      discardRecording = false;
      recorder = undefined;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
        activeStream = undefined;
      }
      lockSurprise("Recording failed. Check your camera/microphone permissions and try again.");
      statusMessage.dataset.kind = "error";
    });
    recorder.addEventListener("stop", async () => {
      const mimeType = recorder?.mimeType || "video/webm";
      const blob = new Blob(chunks, { type: mimeType });
      recorder = undefined;
      finishingRecording = false;
      lockSurprise();
      if (discardRecording || !consented) {
        discardRecording = false;
        setStatus("Recording discarded because consent was withdrawn.");
        openButton.disabled = true;
        return;
      }
      if (!blob.size) {
        setStatus("The browser didn't create a video. Please try opening the surprise again.", "error");
        openButton.disabled = !consented || !isSupabaseConfigured;
        return;
      }

      openButton.disabled = true;
      setStatus("Recording complete. Uploading it privately for the site admin…");
      try {
        await saveReactionClip(blob, mimeType);
        setStatus("Recording uploaded. Only the site admin can view it.", "success");
      } catch (error) {
        setStatus(`The recording couldn't be uploaded: ${error.message}`, "error");
      } finally {
        openButton.disabled = !consented || !isSupabaseConfigured;
      }
    }, { once: true });

    lockedView.hidden = true;
    revealedView.hidden = false;
    openButton.hidden = true;
    lockButton.hidden = false;
    recordingBadge.hidden = false;
    recordingLabel.textContent = "Recording your reaction · private cloud upload";
    discardRecording = false;
    recorder.start(250);
    recordingStartedAt = Date.now();
    setStatus("Recording started. It stops automatically after 10 seconds.");
    startCountdown();
  } catch (error) {
    if (activeStream) {
      activeStream.getTracks().forEach((track) => track.stop());
      activeStream = undefined;
    }
    recorder = undefined;
    finishingRecording = false;
    lockSurprise();
    if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
      setStatus("Camera/microphone access wasn't allowed. Nothing was recorded.", "error");
    } else {
      setStatus("Couldn't start the camera or microphone. Check browser permissions and try again.", "error");
    }
  }
}

function revokeConsent() {
  consented = false;
  consentCheckbox.checked = false;
  dialogConsentCheckbox.checked = false;
  continueButton.disabled = true;
  consentDialog.hidden = false;
  if (recorder?.state === "recording") {
    discardRecording = true;
    finishRecording("Recording stopped because consent was withdrawn.");
  }
  openButton.disabled = true;
}

consentCheckbox.addEventListener("change", () => {
  if (!consentCheckbox.checked) {
    revokeConsent();
    return;
  }
  consented = true;
  consentDialog.hidden = true;
  openButton.disabled = !isSupabaseConfigured;
  setStatus("You're all set. Each opening records one 10-second clip.");
});

dialogConsentCheckbox.addEventListener("change", () => {
  continueButton.disabled = !dialogConsentCheckbox.checked;
});

continueButton.addEventListener("click", () => {
  if (!dialogConsentCheckbox.checked) return;
  consented = true;
  consentCheckbox.checked = true;
  consentDialog.hidden = true;
  openButton.disabled = !isSupabaseConfigured;
  setStatus("You're all set. Each opening records one 10-second clip.");
  openButton.focus();
});

declineButton.addEventListener("click", () => {
  consentDialog.hidden = true;
  setStatus("No problem. The surprise stays locked; you can agree later.");
  consentCheckbox.focus();
});

openButton.addEventListener("click", openSurprise);

lockButton.addEventListener("click", () => {
  if (recorder?.state === "recording") {
    finishRecording("Recording stopped early. Uploading the clip privately…");
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && recorder?.state === "recording") {
    finishRecording("Recording stopped because this page was hidden.");
  }
});

window.addEventListener("pagehide", () => {
  if (recorder?.state === "recording") recorder.stop();
  if (activeStream) activeStream.getTracks().forEach((track) => track.stop());
});

if (!isSupabaseConfigured) {
  setStatus("Cloud storage isn't configured yet. Please contact the site admin.", "error");
} else {
  getSurprisePhoto()
    .then((photo) => {
      if (!photo) return;
      surpriseImage.src = photo.url;
      surpriseImage.hidden = false;
      photoPlaceholder.hidden = true;
    })
    .catch((error) => {
      setStatus(`Couldn't load the surprise photo: ${error.message}`, "error");
    });
}
