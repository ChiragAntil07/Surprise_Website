import {
  deleteReactionClip,
  deleteSurprisePhoto,
  getReactionClips,
  getSurprisePhoto,
  saveSurprisePhoto,
} from "./storage.js";
import { getSupabase, isAdmin, isSupabaseConfigured } from "./supabase.js";

const adminLogin = document.querySelector("#adminLogin");
const loginForm = document.querySelector("#loginForm");
const loginButton = document.querySelector("#loginButton");
const loginStatus = document.querySelector("#loginStatus");
const adminEmail = document.querySelector("#adminEmail");
const adminPassword = document.querySelector("#adminPassword");
const adminContent = document.querySelector("#adminContent");
const signOutButton = document.querySelector("#signOutButton");
const photoInput = document.querySelector("#photoInput");
const photoButtonLabel = document.querySelector("#photoButtonLabel");
const surpriseImage = document.querySelector("#surpriseImage");
const photoEmpty = document.querySelector("#photoEmpty");
const removePhotoButton = document.querySelector("#removePhotoButton");
const recordingsList = document.querySelector("#recordingsList");
const recordingCount = document.querySelector("#recordingCount");
const emptyRecordings = document.querySelector("#emptyRecordings");
const adminStatus = document.querySelector("#adminStatus");

function setStatus(message, kind = "") {
  adminStatus.textContent = message;
  if (kind) {
    adminStatus.dataset.kind = kind;
  } else {
    delete adminStatus.dataset.kind;
  }
}

function setLoginStatus(message, kind = "") {
  loginStatus.textContent = message;
  if (kind) {
    loginStatus.dataset.kind = kind;
  } else {
    delete loginStatus.dataset.kind;
  }
}

function showPhoto(photo) {
  if (!photo) {
    surpriseImage.removeAttribute("src");
    surpriseImage.hidden = true;
    photoEmpty.hidden = false;
    removePhotoButton.hidden = true;
    photoButtonLabel.textContent = "Choose a photo";
    return;
  }

  surpriseImage.src = photo.url;
  surpriseImage.hidden = false;
  photoEmpty.hidden = true;
  removePhotoButton.hidden = false;
  photoButtonLabel.textContent = "Change photo";
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function renderClip(clip) {
  const item = document.createElement("li");
  item.className = "admin-recording-item";

  const video = document.createElement("video");
  video.className = "admin-video";
  video.controls = true;
  video.preload = "metadata";
  video.src = clip.url;

  const details = document.createElement("div");
  details.className = "admin-recording-details";

  const title = document.createElement("p");
  title.className = "admin-recording-title";
  title.textContent = `Reaction · ${formatDate(clip.createdAt)}`;

  const actions = document.createElement("div");
  actions.className = "admin-recording-actions";

  const download = document.createElement("a");
  download.className = "recording-download";
  download.href = clip.url;
  download.download = `reaction-${clip.id}.${clip.mimeType.split("/")[1]}`;
  download.textContent = "Download";

  const remove = document.createElement("button");
  remove.className = "text-button";
  remove.type = "button";
  remove.textContent = "Delete";
  remove.addEventListener("click", async () => {
    if (!window.confirm("Permanently delete this reaction clip?")) return;
    remove.disabled = true;
    try {
      await deleteReactionClip(clip.id);
      item.remove();
      updateClipCount();
      setStatus("Reaction clip deleted.", "success");
    } catch (error) {
      remove.disabled = false;
      setStatus(`Couldn't delete that clip: ${error.message}`, "error");
    }
  });

  actions.append(download, remove);
  details.append(title, actions);
  item.append(video, details);
  return item;
}

function updateClipCount() {
  const count = recordingsList.children.length;
  recordingCount.textContent = `${count} ${count === 1 ? "clip" : "clips"}`;
  emptyRecordings.hidden = count > 0;
}

async function loadAdminData() {
  try {
    const [photo, clips] = await Promise.all([getSurprisePhoto(), getReactionClips()]);
    showPhoto(photo);
    recordingsList.replaceChildren();
    clips.forEach((clip) => recordingsList.append(renderClip(clip)));
    updateClipCount();
  } catch (error) {
    setStatus(`Couldn't load cloud data: ${error.message}`, "error");
  }
}

photoInput.addEventListener("change", async () => {
  const file = photoInput.files?.[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    setStatus("Choose a JPEG, PNG, or WebP image.", "error");
    photoInput.value = "";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setStatus("The photo is larger than the 10 MB upload limit.", "error");
    photoInput.value = "";
    return;
  }

  photoInput.disabled = true;
  try {
    await saveSurprisePhoto(file);
    const photo = await getSurprisePhoto();
    showPhoto(photo);
    setStatus("Surprise photo uploaded.", "success");
  } catch (error) {
    setStatus(`Couldn't upload the photo: ${error.message}`, "error");
  } finally {
    photoInput.disabled = false;
    photoInput.value = "";
  }
});

removePhotoButton.addEventListener("click", async () => {
  removePhotoButton.disabled = true;
  try {
    await deleteSurprisePhoto();
    showPhoto(undefined);
    setStatus("Surprise photo removed from cloud storage.", "success");
  } catch (error) {
    setStatus(`Couldn't remove the photo: ${error.message}`, "error");
  } finally {
    removePhotoButton.disabled = false;
  }
});

async function activateAdmin() {
  if (!(await isAdmin())) {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
    adminLogin.hidden = false;
    adminContent.hidden = true;
    signOutButton.hidden = true;
    setLoginStatus("This account isn't authorized to manage this surprise.", "error");
    return;
  }
  adminLogin.hidden = true;
  adminContent.hidden = false;
  signOutButton.hidden = false;
  await loadAdminData();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isSupabaseConfigured) {
    setLoginStatus("Add the Supabase environment variables before signing in.", "error");
    return;
  }

  loginButton.disabled = true;
  setLoginStatus("Signing in…");
  try {
    const { error } = await getSupabase().auth.signInWithPassword({
      email: adminEmail.value.trim(),
      password: adminPassword.value,
    });
    if (error) throw error;
    adminPassword.value = "";
    await activateAdmin();
  } catch (error) {
    setLoginStatus(`Sign-in failed: ${error.message}`, "error");
  } finally {
    loginButton.disabled = false;
  }
});

signOutButton.addEventListener("click", async () => {
  signOutButton.disabled = true;
  try {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
    adminContent.hidden = true;
    adminLogin.hidden = false;
    signOutButton.hidden = true;
    setLoginStatus("You have signed out.");
  } catch (error) {
    setStatus(`Couldn't sign out: ${error.message}`, "error");
  } finally {
    signOutButton.disabled = false;
  }
});

async function initializeAdmin() {
  adminLogin.hidden = false;
  if (!isSupabaseConfigured) {
    loginButton.disabled = true;
    setLoginStatus("Supabase isn't configured. Set the Vercel environment variables first.", "error");
    return;
  }

  try {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) throw error;
    if (data.session) await activateAdmin();
  } catch (error) {
    setLoginStatus(`Couldn't check the admin session: ${error.message}`, "error");
  }
}

initializeAdmin();
