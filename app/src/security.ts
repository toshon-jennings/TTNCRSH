// Native Web Crypto API PBKDF2 + AES-GCM 256-bit encryption/decryption
export async function encryptKey(plainText: string, pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  const baseKey = await crypto.subtle.importKey(
    'raw', pinData, 'PBKDF2', false, ['deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainText)
  );
  
  // Combine salt, iv, and ciphertext
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  // Convert combined buffer to base64
  return btoa(String.fromCharCode(...combined));
}

export async function decryptKey(base64Data: string, pin: string): Promise<string> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);
  
  // Convert base64 to Uint8Array
  const binary = atob(base64Data);
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    data[i] = binary.charCodeAt(i);
  }
  
  if (data.length < 28) {
    throw new Error('Invalid encrypted data format');
  }
  
  const salt = data.slice(0, 16);
  const iv = data.slice(16, 28);
  const ciphertext = data.slice(28);
  
  const baseKey = await crypto.subtle.importKey(
    'raw', pinData, 'PBKDF2', false, ['deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  return decoder.decode(decrypted);
}
