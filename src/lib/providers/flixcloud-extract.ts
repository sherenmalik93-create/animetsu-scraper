/**
 * Flixcloud m3u8 extractor
 *
 * Flixcloud serves its HLS streams via a multi-stage encrypted pipeline that
 * the embed page decrypts at runtime:
 *
 *   1. Page contains: obfuscation_seed, obfuscated_crypto_data, w_payload (WASM),
 *      and a bunch of obfuscated fields (key-value pairs with hex-encoded names).
 *   2. The page's JS derives a "field map" from obfuscation_seed via 6 rounds of
 *      SHA-256 — this tells us which obfuscated field names hold the AES key,
 *      IV, second key fragment, and the API token.
 *   3. It calls GET /api/m3u8/{token} to get {enc_m3u8_b64, enc_aes_key_b64}.
 *   4. It runs the WASM (w_payload) on (frag1, keyFrag2, enc_aes_key, seed_int)
 *      to derive a 32-byte PBKDF2 password.
 *   5. PBKDF2-SHA256(password, salt=seed, iter=1000) → 32 bytes.
 *   6. XOR each byte with seed.charCodeAt(i % seed.length) → 32 bytes.
 *   7. SHA-256 of those 32 bytes → final AES-256 key.
 *   8. AES-256-CBC decrypt enc_m3u8 with key + IV from page → plaintext m3u8 URL.
 *
 * Cloudflare / Turnstile note:
 *   The /api/m3u8/{token} endpoint is gated by Cloudflare's bot management.
 *   Curl can fetch the embed HTML just fine, but the m3u8 token API rejects
 *   tokens that weren't preceded by a real Cloudflare Turnstile solve (which
 *   requires executing Cloudflare's JS challenge in a real browser). Without
 *   that solve, the API returns 410 "invalid_or_used_token".
 *
 *   This means: in many server-side environments the extraction will FAIL at
 *   step 3. Callers MUST treat `extractM3u8()` as best-effort and fall back
 *   to the iframe URL (which works fine in the user's real browser because
 *   the browser solves Turnstile natively).
 *
 *   When Cloudflare's policy is lenient (e.g. fresh datacenter IP, no recent
 *   abuse from that /24), the token API does accept our request and the full
 *   pipeline succeeds — yielding a playable m3u8 URL that we then route
 *   through /api/proxy/m3u8 for CORS-safe playback in our own player.
 */

import { webcrypto } from "node:crypto";
import { execFileSync } from "node:child_process";

const FLIXCLOUD_BASE = "https://flixcloud.cc";
const ANIMEX_REFERER = "https://animex.one/";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface FlixcloudEmbedData {
  /** Plain m3u8 URL on success; null if extraction failed. */
  m3u8: string | null;
  /** Subtitles extracted from the page (always available). */
  subtitles: { url: string; language: string; format: string; default?: boolean }[];
  /** Intro/outro skip markers (always available when present). */
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  /** Original embed URL (for iframe fallback). */
  embedUrl: string;
  /** Diagnostics — what step we got to and any error. */
  debug: {
    pageFetched: boolean;
    tokenFound: boolean;
    apiStatus: number | null;
    apiError?: string;
    decrypted: boolean;
  };
}

/* ------------------------------------------------------------------ */
/*  Curl-backed HTTP                                                    */
/* ------------------------------------------------------------------ */

/**
 * Curl-backed GET — Node's undici gets 403'd by Cloudflare's TLS fingerprinting,
 * but curl with the right headers sails through. Used for both the embed HTML
 * and the m3u8 token API.
 */
function curlGet(url: string, referer: string): { status: number; body: string } {
  const args = [
    "-s",
    "-A", BROWSER_UA,
    "-H", `Referer: ${referer}`,
    "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", 'Sec-Ch-Ua: "Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "-H", "Sec-Ch-Ua-Mobile: ?0",
    "-H", 'Sec-Ch-Ua-Platform: "Windows"',
    "-H", "Sec-Fetch-Dest: iframe",
    "-H", "Sec-Fetch-Mode: navigate",
    "-H", "Sec-Fetch-Site: cross-site",
    "-H", "Upgrade-Insecure-Requests: 1",
    "--max-time", "15",
    "-w", "\n__HTTP_STATUS__%{http_code}",
    url,
  ];
  let out: string;
  try {
    out = execFileSync("curl", args, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    return { status: 0, body: String(err) };
  }
  const m = out.match(/__HTTP_STATUS__(\d+)\s*$/);
  const status = m ? parseInt(m[1], 10) : 0;
  const body = m ? out.slice(0, m.index) : out;
  return { status, body };
}

/* ------------------------------------------------------------------ */
/*  Crypto helpers (ported verbatim from flixcloud bundle)              */
/* ------------------------------------------------------------------ */

/** base64 → Uint8Array (port of `lt()`) */
function b64ToBytes(t: string): Uint8Array {
  const e = Buffer.from(t, "base64");
  const s = new Uint8Array(e.length);
  for (let i = 0; i < e.length; i++) s[i] = e[i];
  return s;
}

/** SHA-256(text) → hex string (port of `xt()`) */
async function sha256Hex(t: string): Promise<string> {
  const e = new TextEncoder().encode(t);
  const s = await webcrypto.subtle.digest("SHA-256", e);
  return Array.from(new Uint8Array(s))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("");
}

interface FieldMap {
  videoField: string;
  keyField: string;
  ivField: string;
  containerName: string;
  arrayName: string;
  objectName: string;
  tokenField: string;
  keyFrag2Field: string;
}

/** Derive the obfuscated field-name map from the seed (port of `_e()`). */
async function deriveFieldMap(seed: string): Promise<FieldMap> {
  let e = seed;
  for (let o = 0; o < 3; o++) e = await sha256Hex(e + o.toString());
  let s = e;
  for (let o = 0; o < 3; o++) s = await sha256Hex(s + o.toString());
  return {
    videoField: `vf_${e.substring(0, 8)}`,
    keyField: `kf_${e.substring(8, 16)}`,
    ivField: `ivf_${e.substring(16, 24)}`,
    containerName: `cd_${e.substring(24, 32)}`,
    arrayName: `ad_${e.substring(32, 40)}`,
    objectName: `od_${e.substring(40, 48)}`,
    tokenField: `${e.substring(48, 64)}_${e.substring(56, 64)}`,
    keyFrag2Field: `${s.substring(0, 16)}_${s.substring(16, 24)}`,
  };
}

/** Pull the AES key + IV out of obfuscated_crypto_data (port of `xe()`). */
function extractKeyAndIv(
  obf: Record<string, unknown>,
  m: FieldMap
): { frag1_b64: string; iv_b64: string } {
  const container = obf[m.containerName] as Record<string, unknown> | undefined;
  if (!container) throw new Error("container not found: " + m.containerName);
  const arr = container[m.arrayName] as unknown[] | undefined;
  if (!arr || !Array.isArray(arr) || arr.length === 0)
    throw new Error("array not found: " + m.arrayName);
  const obj = (arr[0] as Record<string, string>)[m.objectName];
  if (!obj) throw new Error("object not found: " + m.objectName);
  const f = obj[m.keyField];
  const b = obj[m.ivField];
  if (!f || !b) throw new Error("missing key/iv");
  return { frag1_b64: f, iv_b64: b };
}

let _wasmInstance: WebAssembly.Instance | null = null;

/** Run the page's WASM on (frag1, keyFrag2, enc_key, seed_int) → 32 bytes (port of `ke()`). */
async function runWasm(
  frag1: Uint8Array,
  keyFrag2: Uint8Array,
  encKey: Uint8Array,
  seedInt: number,
  wPayloadB64: string
): Promise<Uint8Array> {
  const wasmBytes = b64ToBytes(wPayloadB64);
  if (!_wasmInstance) {
    const result = await WebAssembly.instantiate(wasmBytes, {});
    _wasmInstance = ("instance" in result ? result.instance : result) as WebAssembly.Instance;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exports = _wasmInstance.exports as any;
  const mem = exports.memory;
  if (mem.buffer.byteLength === 0) mem.grow(1);
  const view = new Uint8Array(mem.buffer);
  const k = frag1.length;
  const p = 1e3;
  const v = p + k;
  const T = v + k;
  const i = T + k;
  view.set(frag1, p);
  view.set(keyFrag2, v);
  view.set(encKey, T);
  exports._s(seedInt);
  exports._r(p, v, T, i, k);
  const out = new Uint8Array(k);
  out.set(view.subarray(i, i + k));
  return out;
}

/* ------------------------------------------------------------------ */
/*  Page parsing                                                        */
/* ------------------------------------------------------------------ */

interface FlixcloudPageData {
  obfuscation_seed: string;
  obfuscated_crypto_data: Record<string, unknown>;
  w_payload: string;
  subtitles: { url: string; language: string; format: string; default?: boolean }[];
  intro_chapter?: { start: number; end: number };
  outro_chapter?: { start: number; end: number };
  [k: string]: unknown;
}

/** Parse the SvelteKit data block out of the embed HTML. */
function parsePageData(html: string): FlixcloudPageData | null {
  const startMarker = 'type:"data",data:{';
  const startIdx = html.indexOf(startMarker);
  if (startIdx < 0) return null;
  const objStart = startIdx + startMarker.length - 1; // points at the opening {

  // Walk to the matching closing brace, respecting string literals.
  let depth = 0;
  let inStr = false;
  let esc = false;
  let endIdx = -1;
  for (let i = objStart; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx < 0) return null;

  const raw = html.slice(objStart, endIdx + 1);
  // Wrap unquoted keys so JSON.parse accepts the object.
  const quoted = raw.replace(/([{,])([a-zA-Z0-9_]+):/g, '$1"$2":');
  try {
    return JSON.parse(quoted) as FlixcloudPageData;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main extraction pipeline                                            */
/* ------------------------------------------------------------------ */

/**
 * Best-effort m3u8 extraction for a flixcloud.cc embed.
 *
 * Returns the m3u8 URL on success (plus subtitles + skip markers from the
 * page — those are always available regardless of extraction success).
 * Returns `m3u8: null` when Cloudflare's bot management blocks the token API
 * (HTTP 410). The caller should fall back to the iframe URL in that case.
 */
export async function extractFlixcloudM3u8(
  accessId: string
): Promise<FlixcloudEmbedData> {
  const embedUrl = `${FLIXCLOUD_BASE}/e/${accessId}?v=1`;
  const result: FlixcloudEmbedData = {
    m3u8: null,
    subtitles: [],
    embedUrl,
    debug: {
      pageFetched: false,
      tokenFound: false,
      apiStatus: null,
      decrypted: false,
    },
  };

  // 1. Fetch the embed HTML via curl (Node's undici gets 403'd by Cloudflare).
  const page = curlGet(embedUrl, ANIMEX_REFERER);
  if (page.status !== 200) {
    result.debug.apiError = `page fetch ${page.status}`;
    return result;
  }
  result.debug.pageFetched = true;

  // 2. Parse the SvelteKit data block.
  const data = parsePageData(page.body);
  if (!data || !data.obfuscation_seed || !data.w_payload) {
    result.debug.apiError = "could not parse page data";
    return result;
  }

  // Always extract subtitles + skip markers from the page — these are
  // inlined in the HTML and don't require the API call.
  result.subtitles = Array.isArray(data.subtitles) ? data.subtitles : [];
  if (data.intro_chapter) result.intro = data.intro_chapter;
  if (data.outro_chapter) result.outro = data.outro_chapter;

  // 3. Derive the field-name map and pull out the key/IV/frag2/token.
  let map: FieldMap;
  try {
    map = await deriveFieldMap(data.obfuscation_seed);
  } catch (err) {
    result.debug.apiError = `field map: ${String(err)}`;
    return result;
  }

  let keyIv: { frag1_b64: string; iv_b64: string };
  try {
    keyIv = extractKeyAndIv(data.obfuscated_crypto_data, map);
  } catch (err) {
    result.debug.apiError = `key/iv: ${String(err)}`;
    return result;
  }

  const keyFrag2 = data[map.keyFrag2Field];
  if (typeof keyFrag2 !== "string") {
    result.debug.apiError = `keyFrag2 missing at ${map.keyFrag2Field}`;
    return result;
  }

  let token: string | null = null;
  for (const [k, v] of Object.entries(data)) {
    if (k === map.tokenField && typeof v === "string" && v.length > 0) {
      token = v;
      break;
    }
  }
  if (!token) {
    result.debug.apiError = `token missing at ${map.tokenField}`;
    return result;
  }
  result.debug.tokenFound = true;

  // 4. Call /api/m3u8/{token} to get the encrypted m3u8 + AES key.
  const apiUrl = `${FLIXCLOUD_BASE}/api/m3u8/${encodeURIComponent(token)}`;
  const api = curlGet(apiUrl, embedUrl);
  result.debug.apiStatus = api.status;
  if (api.status !== 200) {
    // 410 "invalid_or_used_token" = Cloudflare bot management blocked us
    // because we didn't solve the Turnstile challenge. Fall back to iframe.
    result.debug.apiError = `api ${api.status}: ${api.body.slice(0, 120)}`;
    return result;
  }

  let apiJson: Record<string, string>;
  try {
    apiJson = JSON.parse(api.body);
  } catch {
    result.debug.apiError = "api response not JSON";
    return result;
  }

  // 5. Look up enc_m3u8 + enc_aes_key by their derived 10-char keys.
  const m3u8Key = (await sha256Hex(token + "vid")).substring(0, 10);
  const aesKeyKey = (await sha256Hex(token + "key")).substring(0, 10);
  const encM3u8B64 = apiJson[m3u8Key];
  const encAesKeyB64 = apiJson[aesKeyKey];
  if (!encM3u8B64 || !encAesKeyB64) {
    result.debug.apiError = `api response missing keys (have: ${Object.keys(apiJson).join(",")})`;
    return result;
  }

  // 6. Run the WASM to derive the PBKDF2 password input.
  const seed = data.obfuscation_seed;
  const seedInt = parseInt(seed.substring(0, 8), 16);
  let pbkdfInput: Uint8Array;
  try {
    pbkdfInput = await runWasm(
      b64ToBytes(keyIv.frag1_b64),
      b64ToBytes(keyFrag2),
      b64ToBytes(encAesKeyB64),
      seedInt,
      data.w_payload
    );
  } catch (err) {
    result.debug.apiError = `wasm: ${String(err)}`;
    return result;
  }

  // 7. PBKDF2 → XOR with seed → SHA-256 → final AES key.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subtle = webcrypto.subtle as any;
    const pbkdfKey = await subtle.importKey(
      "raw",
      pbkdfInput,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const derived = await subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(seed),
        iterations: 1000,
        hash: "SHA-256",
      },
      pbkdfKey,
      256
    );
    const xored = new Uint8Array(derived);
    for (let i = 0; i < 32; i++) xored[i] ^= seed.charCodeAt(i % seed.length);
    const finalKeyHash = await subtle.digest("SHA-256", xored);
    const finalKey = new Uint8Array(finalKeyHash);

    // 8. AES-CBC decrypt → plaintext m3u8 URL.
    const aesKey = await subtle.importKey(
      "raw",
      finalKey,
      { name: "AES-CBC" },
      false,
      ["decrypt"]
    );
    const decrypted = await subtle.decrypt(
      { name: "AES-CBC", iv: b64ToBytes(keyIv.iv_b64) },
      aesKey,
      b64ToBytes(encM3u8B64)
    );
    const m3u8 = new TextDecoder().decode(decrypted).trim();
    if (!m3u8) {
      result.debug.apiError = "decrypted URL is empty";
      return result;
    }
    result.m3u8 = m3u8;
    result.debug.decrypted = true;
    return result;
  } catch (err) {
    result.debug.apiError = `decrypt: ${String(err)}`;
    return result;
  }
}

/**
 * Build a proxy-wrapped m3u8 URL that the browser can drop directly into an
 * HLS player (e.g. hls.js / Plyr). The proxy adds the correct Referer header
 * (https://flixcloud.cc/) so Cloudflare doesn't 403 the segment fetches.
 */
export function buildProxiedM3u8(m3u8Url: string): string {
  return `/api/proxy/m3u8?url=${encodeURIComponent(m3u8Url)}&referer=${encodeURIComponent(
    "https://flixcloud.cc/"
  )}`;
}
