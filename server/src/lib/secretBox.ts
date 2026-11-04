import crypto from "crypto";

/**
 * AES-256-GCM encryption for secrets stored in the database (Google refresh
 * tokens) and for the OAuth `state` parameter. The key is CALENDAR_TOKEN_KEY:
 * 32 random bytes, base64 (generate with `openssl rand -base64 32`).
 * Output format: "v1.<iv>.<tag>.<ciphertext>", each part base64url.
 */

function key(): Buffer {
  const raw = process.env.CALENDAR_TOKEN_KEY?.trim();
  if (!raw) throw new Error("CALENDAR_TOKEN_KEY is not set");
  // Exactly what `openssl rand -base64 32` prints. Node's decoder skips
  // characters it doesn't recognize, so check the text before decoding.
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) throw new Error("CALENDAR_TOKEN_KEY must be 32 bytes, base64-encoded");
  const k = Buffer.from(raw, "base64");
  return k;
}

export function hasSecretKey() {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function seal(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** Returns null for anything that wasn't sealed with the current key (tampered, truncated, wrong key). */
export function open(sealed: string): string | null {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const [iv, tag, ct] = parts.slice(1).map((p) => Buffer.from(p, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
