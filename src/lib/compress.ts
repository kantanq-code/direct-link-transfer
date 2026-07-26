export async function compressString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const compressed = await new Response(
    new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"))
  ).arrayBuffer();
  return arrayBufferToBase64(compressed);
}

export async function decompressString(input: string): Promise<string> {
  const compressed = base64ToArrayBuffer(input);
  const decompressed = await new Response(
    new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))
  ).arrayBuffer();
  return new TextDecoder().decode(decompressed);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
