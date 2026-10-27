import { lookup } from "dns/promises";
import net from "net";

/**
 * Fetches a subscribed calendar feed. The URL is user-supplied, so this only
 * talks to public http(s) hosts (no localhost, private ranges or cloud
 * metadata addresses), re-checks every redirect, and caps time and size.
 */

export class IcsFetchError extends Error {}

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

/** webcal:// is just http(s) with a different scheme so the OS opens a calendar app. */
export function normalizeFeedUrl(raw: string): string {
  const trimmed = raw.trim();
  const url = new URL(trimmed.replace(/^webcals?:\/\//i, "https://"));
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new IcsFetchError("Calendar URL must start with https://, http:// or webcal://");
  }
  return url.toString();
}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||           // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    v6 === "::" || v6 === "::1" ||
    v6.startsWith("fc") || v6.startsWith("fd") || // unique local
    v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || // link-local
    v6.startsWith("ff") // multicast
  );
}

async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new IcsFetchError("Calendar URL must be a public address");
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => {
    throw new IcsFetchError(`Couldn't find the server ${host}`);
  });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new IcsFetchError("Calendar URL must be a public address");
  }
}

export async function fetchIcs(rawUrl: string): Promise<string> {
  let url = new URL(normalizeFeedUrl(rawUrl));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; ; hop++) {
      await assertPublicHost(url);
      const res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1", "User-Agent": "StageFlow-Calendar/1.0" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        if (hop >= MAX_REDIRECTS) throw new IcsFetchError("Too many redirects");
        url = new URL(res.headers.get("location")!, url);
        if (url.protocol !== "https:" && url.protocol !== "http:") throw new IcsFetchError("Redirected to an unsupported URL");
        continue;
      }
      if (!res.ok) throw new IcsFetchError(`The calendar server answered ${res.status}`);

      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_BYTES) throw new IcsFetchError("Calendar is larger than 5 MB");
      const reader = res.body?.getReader();
      if (!reader) return "";
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          throw new IcsFetchError("Calendar is larger than 5 MB");
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks).toString("utf8");
    }
  } catch (err) {
    if (err instanceof IcsFetchError) throw err;
    if ((err as Error).name === "AbortError") throw new IcsFetchError("The calendar server took too long to answer");
    throw new IcsFetchError(`Couldn't download the calendar: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
