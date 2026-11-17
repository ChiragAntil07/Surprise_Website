import { getSupabase } from "./supabase.js";

const PHOTO_BUCKET = "surprise-photos";
const PHOTO_PATH = "surprise/current";
const CLIP_BUCKET = "reaction-clips";
const MAX_CLIP_SIZE = 25 * 1024 * 1024;
const ALLOWED_CLIP_TYPES = new Set(["video/webm", "video/mp4", "video/ogg"]);

function getBaseMimeType(mimeType) {
  return mimeType.split(";")[0].trim().toLowerCase();
}

export async function getSurprisePhoto() {
  const client = getSupabase();
  const { data: files, error } = await client.storage
    .from(PHOTO_BUCKET)
    .list("surprise", { limit: 10, search: "current" });

  if (error) throw error;
  if (!files.some((file) => file.name === "current")) return undefined;

  const { data } = client.storage.from(PHOTO_BUCKET).getPublicUrl(PHOTO_PATH);
  return { url: data.publicUrl };
}

export async function saveSurprisePhoto(file) {
  const { error } = await getSupabase().storage.from(PHOTO_BUCKET).upload(PHOTO_PATH, file, {
    cacheControl: "0",
    contentType: file.type,
    upsert: true,
  });
  if (error) throw error;
}

export async function deleteSurprisePhoto() {
  const { error } = await getSupabase().storage.from(PHOTO_BUCKET).remove([PHOTO_PATH]);
  if (error) throw error;
}

export async function saveReactionClip(blob, mimeType) {
  const client = getSupabase();
  const baseMimeType = getBaseMimeType(mimeType);
  if (!ALLOWED_CLIP_TYPES.has(baseMimeType)) {
    throw new Error(`This browser created an unsupported video format (${baseMimeType}).`);
  }
  if (blob.size > MAX_CLIP_SIZE) {
    throw new Error("The recording is larger than the 25 MB upload limit.");
  }

  const extension = baseMimeType.slice("video/".length);
  const storagePath = `incoming/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await client.storage.from(CLIP_BUCKET).upload(storagePath, blob, {
    contentType: baseMimeType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: recordError } = await client.rpc("register_reaction_clip", {
    p_storage_path: storagePath,
    p_mime_type: baseMimeType,
  });
  if (recordError) {
    throw new Error(
      `The video uploaded, but its database record couldn't be created: ${recordError.message}. The private file may need cleanup in Supabase Storage.`,
    );
  }
}

export async function getReactionClips() {
  const client = getSupabase();
  const { data: clips, error } = await client
    .from("reaction_clips")
    .select("id, storage_path, mime_type, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return Promise.all(
    clips.map(async (clip) => {
      const { data, error: signedUrlError } = await client.storage
        .from(CLIP_BUCKET)
        .createSignedUrl(clip.storage_path, 3600);
      if (signedUrlError) throw signedUrlError;
      return {
        id: clip.id,
        createdAt: Date.parse(clip.created_at),
        mimeType: clip.mime_type,
        url: data.signedUrl,
      };
    }),
  );
}

export async function deleteReactionClip(id) {
  const client = getSupabase();
  const { data: clip, error: lookupError } = await client
    .from("reaction_clips")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (lookupError) throw lookupError;

  const { error: storageError } = await client.storage
    .from(CLIP_BUCKET)
    .remove([clip.storage_path]);
  if (storageError) throw storageError;

  const { error: recordError } = await client.from("reaction_clips").delete().eq("id", id);
  if (recordError) throw recordError;
}
