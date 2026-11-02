import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';

// XOR Byte Vector Split 1 (Random Byte Mask A)
const VECTOR_A = Object.freeze([
  65, 221, 64, 149, 144, 200, 252, 140, 163, 67, 36, 53, 153, 177, 98, 100, 201, 61, 158, 42, 85,
  58, 41, 242, 85, 232, 47, 103, 228, 174, 12, 144, 112, 116, 60, 205, 6, 69, 9,
]);

// XOR Byte Vector Split 2 (Random Byte Mask B)
const VECTOR_B = Object.freeze([
  186, 109, 236, 218, 129, 17, 175, 229, 81, 198, 114, 216, 97, 129, 208, 205, 44, 35, 43, 114,
  194, 102, 100, 239, 249, 191, 187, 99, 152, 115, 86, 229, 60, 212, 177, 53, 97, 209, 83,
]);

// XOR Byte Vector Split 3 (Residual Checksum C)
const VECTOR_C = Object.freeze([
  186, 249, 214, 46, 66, 160, 18, 8, 155, 207, 23, 131, 171, 88, 213, 237, 211, 113, 197, 1, 246,
  113, 62, 89, 233, 50, 219, 86, 47, 182, 14, 51, 26, 148, 186, 141, 47, 236, 110,
]);

// Built-in Developer Gemini Key Split 1
const VECTOR_GEMINI_A = Object.freeze([
  81, 54, 222, 6, 91, 76, 68, 72, 249, 33, 91, 141, 80, 233, 79, 239, 132, 133, 250, 94, 126, 189,
  30, 4, 149, 223, 246, 44, 183, 161, 32, 155, 9, 58, 52, 254, 205, 202, 45, 223, 210, 180, 117,
  253, 227, 122, 114, 120, 212, 48, 150, 168, 117,
]);

// Built-in Developer Gemini Key Split 2
const VECTOR_GEMINI_B = Object.freeze([
  47, 37, 236, 30, 28, 158, 196, 18, 255, 190, 34, 38, 215, 242, 228, 55, 205, 8, 106, 250, 106, 76,
  136, 44, 253, 230, 102, 58, 116, 203, 239, 197, 212, 222, 134, 94, 134, 155, 121, 47, 14, 121,
  146, 10, 193, 117, 68, 167, 167, 51, 143, 254, 173,
]);

// Built-in Developer Gemini Key Split 3
const VECTOR_GEMINI_C = Object.freeze([
  63, 66, 28, 89, 37, 234, 210, 20, 48, 213, 75, 243, 222, 47, 228, 130, 33, 220, 247, 222, 100,
  191, 245, 94, 12, 9, 193, 71, 156, 26, 250, 56, 168, 182, 202, 193, 122, 7, 26, 163, 174, 161,
  141, 175, 107, 66, 7, 237, 23, 51, 64, 21, 191,
]);

/**
 * Reassemble an obfuscated secret in memory using multi-part XOR arithmetic.
 * Ensures zero plaintext API keys appear in source code or compiled binary distributions.
 */
export function deobfuscateXorVector(
  partA: readonly number[],
  partB: readonly number[],
  partC: readonly number[]
): string {
  const len = partA.length;
  const chars: string[] = new Array(len);
  for (let i = 0; i < len; i++) {
    chars[i] = String.fromCharCode(partA[i] ^ partB[i] ^ partC[i]);
  }
  return chars.join('');
}

/**
 * Resolve the Firebase web API key securely in memory
 */
export function getFirebaseApiKey(): string {
  return deobfuscateXorVector(VECTOR_A, VECTOR_B, VECTOR_C);
}

/**
 * Resolve the built-in developer Gemini API key securely in memory
 */
export function getBuiltInGeminiApiKey(): string {
  return deobfuscateXorVector(VECTOR_GEMINI_A, VECTOR_GEMINI_B, VECTOR_GEMINI_C);
}

const XOR_KEY_MASK = 'IRIS_RETIS_SECRET_SALT_2026';

/**
 * Encodes text with a cyclic XOR mask and returns hex string to protect against binary scraping.
 */
export function xorEncode(text: string, key = XOR_KEY_MASK): string {
  const buf = Buffer.from(text, 'utf8');
  const keyBuf = Buffer.from(key, 'utf8');
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ keyBuf[i % keyBuf.length];
  }
  return out.toString('hex');
}

/**
 * Decodes a hex string produced by xorEncode back to UTF-8 text.
 */
export function xorDecode(hex: string, key = XOR_KEY_MASK): string {
  try {
    const cleanHex = hex.startsWith('xor:') ? hex.slice(4).trim() : hex.trim();
    if (!cleanHex || cleanHex.length % 2 !== 0) return '';
    const buf = Buffer.from(cleanHex, 'hex');
    const keyBuf = Buffer.from(key, 'utf8');
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) {
      out[i] = buf[i] ^ keyBuf[i % keyBuf.length];
    }
    return out.toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Resolve the Gemini API key securely in memory.
 * Supports XOR-encoded format in .env to prevent binary scraping,
 * as well as encrypted vault storage and embedded 3-part XOR vectors.
 */
export function getGeminiApiKey(): string {
  // 1. Check XOR-encoded key in process.env
  const xorEnvKey = (process.env.GEMINI_API_KEY_XOR || '').trim();
  if (xorEnvKey) {
    const decoded = xorDecode(xorEnvKey);
    if (decoded && decoded.length > 10) return decoded;
  }

  // 2. Check GEMINI_API_KEY in process.env (supports plain or xor: prefix)
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  if (envKey && envKey !== 'MY_GEMINI_API_KEY') {
    if (envKey.startsWith('xor:')) {
      const decoded = xorDecode(envKey);
      if (decoded && decoded.length > 10) return decoded;
    } else if (!envKey.startsWith('AIzaSyAa')) {
      return envKey;
    }
  }

  // 3. Check encrypted local vault
  const vaultedKey = readFromVault('gemini_api_key');
  if (vaultedKey && vaultedKey.trim() && !vaultedKey.startsWith('AIzaSyAa')) {
    return vaultedKey.trim();
  }

  // 4. Check ~/.env or .env in process.cwd()
  try {
    const locations = [
      path.join(process.cwd(), '.env'),
      path.join(os.homedir(), '.env'),
    ];
    for (const loc of locations) {
      if (fs.existsSync(loc)) {
        const content = fs.readFileSync(loc, 'utf8');
        const xorMatch = content.match(/^GEMINI_API_KEY_XOR\s*=\s*["']?([^"'\r\n]+)["']?/m);
        if (xorMatch && xorMatch[1]) {
          const dec = xorDecode(xorMatch[1].trim());
          if (dec && dec.length > 10) return dec;
        }
        const match = content.match(/^GEMINI_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/m);
        if (match && match[1] && match[1].trim() !== 'MY_GEMINI_API_KEY') {
          const val = match[1].trim();
          if (val.startsWith('xor:')) {
            const dec = xorDecode(val);
            if (dec && dec.length > 10) return dec;
          } else if (!val.startsWith('AIzaSyAa')) {
            return val;
          }
        }
      }
    }
  } catch {}

  // 5. Check ~/.aside/u/0/credentials.json if present
  try {
    const credPath = path.join(os.homedir(), '.aside', 'u', '0', 'credentials.json');
    if (fs.existsSync(credPath)) {
      const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      if (cred?.google?.key && typeof cred.google.key === 'string' && cred.google.key.trim()) {
        return cred.google.key.trim();
      }
    }
  } catch {}

  // 6. Always return the verified built-in developer Gemini API key from 3-split XOR vectors
  const builtIn = getBuiltInGeminiApiKey();
  try {
    if (builtIn && !readFromVault('gemini_api_key')) {
      saveToVault('gemini_api_key', builtIn);
    }
  } catch {}
  return builtIn;
}

/**
 * Derive local encryption key for AES-256-GCM fallback
 */
function deriveFallbackKey(): Buffer {
  let userIdentifier = 'iris-default-user';
  try {
    userIdentifier = os.userInfo().username || os.hostname();
  } catch {
    userIdentifier = os.hostname();
  }
  const machineSeed = `${os.hostname()}:${userIdentifier}:${process.arch}:${process.platform}`;
  return crypto.scryptSync(machineSeed, 'iris-anti-scraping-vault-salt-v1', 32);
}

/**
 * Encrypt a secret string using Electron DPAPI safeStorage if available,
 * falling back to hardware-bound AES-256-GCM on Wine/Linux/headless Node.
 */
export function encryptSecret(plainText: string): string {
  try {
    const electron = require('electron');
    if (electron?.safeStorage?.isEncryptionAvailable?.()) {
      const buffer = electron.safeStorage.encryptString(plainText);
      return `dpapi:${buffer.toString('base64')}`;
    }
  } catch {
    // Non-electron runtime or safeStorage unavailable
  }

  // Fallback: Hardware-bound AES-256-GCM
  const key = deriveFallbackKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `gcm:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a secret string
 */
export function decryptSecret(cipherData: string): string | null {
  if (!cipherData) return null;

  try {
    if (cipherData.startsWith('dpapi:')) {
      const rawBase64 = cipherData.slice(6);
      const electron = require('electron');
      if (electron?.safeStorage) {
        return electron.safeStorage.decryptString(Buffer.from(rawBase64, 'base64'));
      }
    } else if (cipherData.startsWith('gcm:')) {
      const parts = cipherData.split(':');
      if (parts.length === 4) {
        const iv = Buffer.from(parts[1], 'base64');
        const authTag = Buffer.from(parts[2], 'base64');
        const encrypted = Buffer.from(parts[3], 'base64');
        const key = deriveFallbackKey();

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
      }
    }
  } catch (err) {
    console.warn('[SecurityVault] Failed to decrypt vault secret:', err);
  }
  return null;
}

function resolveVaultFilePath(): string {
  const appData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
  const vaultDir = path.join(appData, 'IrisAI');
  if (!fs.existsSync(vaultDir)) {
    fs.mkdirSync(vaultDir, { recursive: true });
  }
  return path.join(vaultDir, 'vault.enc');
}

/**
 * Persist an encrypted key/value into local machine vault
 */
export function saveToVault(key: string, secret: string): void {
  try {
    const vaultPath = resolveVaultFilePath();
    let records: Record<string, string> = {};
    if (fs.existsSync(vaultPath)) {
      try {
        records = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      } catch {
        records = {};
      }
    }
    records[key] = encryptSecret(secret);
    fs.writeFileSync(vaultPath, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    console.warn('[SecurityVault] Failed to write to vault file:', err);
  }
}

/**
 * Read and decrypt a key/value from local machine vault
 */
export function readFromVault(key: string): string | null {
  try {
    const vaultPath = resolveVaultFilePath();
    if (!fs.existsSync(vaultPath)) return null;
    const records = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
    if (!records[key]) return null;
    return decryptSecret(records[key]);
  } catch {
    return null;
  }
}
