const CLOUD_NAME   = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string;

const HEIC_TYPE = /^image\/hei[cf]$/i;
const HEIC_EXT  = /\.hei[cf]$/i;

/**
 * Rewrite Cloudinary delivery URLs so browsers that can't render HEIC/HEIF
 * (Chrome, Firefox, etc.) get a web-safe format. Mobile Safari can show raw
 * HEIC; desktop usually cannot.
 *
 * Inserts `f_auto,q_auto` after `/image/upload/` — Cloudinary converts on the fly.
 * Non-Cloudinary URLs are returned unchanged.
 */
export function displayPhotoUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  const marker = "/image/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;

  const after = url.slice(idx + marker.length);
  // Already requesting an explicit / auto format
  if (/(?:^|[/,_])f_(?:auto|jpg|jpeg|png|webp|avif)/.test(after)) {
    return url;
  }

  return `${url.slice(0, idx + marker.length)}f_auto,q_auto/${after}`;
}

function isHeicLike(file: File): boolean {
  return HEIC_TYPE.test(file.type) || HEIC_EXT.test(file.name);
}

/** Best-effort HEIC → JPEG so stored assets are web-native; falls back to original file. */
async function toJpegIfNeeded(file: File): Promise<File> {
  if (!isHeicLike(file)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88)
    );
    if (!blob) return file;

    const base = file.name.replace(HEIC_EXT, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    // Chrome can't decode HEIC in-browser — upload original; displayPhotoUrl still fixes viewing.
    return file;
  }
}

export async function uploadImage(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error("Cloudinary env vars are not configured (VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET)");
  }

  const uploadFile = await toJpegIfNeeded(file);

  const formData = new FormData();
  formData.append("file", uploadFile);
  formData.append("upload_preset", UPLOAD_PRESET);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText) as { secure_url: string };
        // Always persist a browser-friendly delivery URL
        resolve(displayPhotoUrl(data.secure_url) ?? data.secure_url);
      } else {
        reject(new Error("Upload failed"));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed")));

    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
    xhr.send(formData);
  });
}
