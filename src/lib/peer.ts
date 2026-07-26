import type { DataConnection } from "peerjs";

export type FileMeta = { name: string; size: number; type: string; path?: string };
export type ReceivedFile = { file: File; path: string };

type FileWithPath = File & { webkitRelativePath?: string };
export function getFilePath(file: File): string {
  const rel = (file as FileWithPath).webkitRelativePath;
  return rel && rel.length > 0 ? rel : file.name;
}

export type TransferState =
  | { kind: "idle" }
  | { kind: "waiting"; code: string }
  | { kind: "connecting" }
  | { kind: "transferring"; sent: number; total: number; fileName: string }
  | { kind: "completed" }
  | { kind: "error"; message: string };

export type OnStateChange = (state: TransferState) => void;

const CHUNK_SIZE = 16 * 1024;
export const PEER_PREFIX = "directdrop-";

// 6 chars, no confusable characters (no 0/O/1/I/L)
export const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function generateCode(len = 6): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function normalizeCode(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function sendFiles(
  conn: DataConnection,
  files: File[],
  onStateChange: OnStateChange
): void {
  const metas: FileMeta[] = files.map((f) => ({ name: f.name, size: f.size, type: f.type }));
  const totalSize = files.reduce((s, f) => s + f.size, 0);

  conn.send({ kind: "meta", files: metas, totalSize });

  let fi = 0;
  let offset = 0;
  let totalSent = 0;

  async function next() {
    if (fi >= files.length) {
      conn.send({ kind: "done" });
      onStateChange({ kind: "completed" });
      return;
    }
    const file = files[fi];
    const end = Math.min(file.size, offset + CHUNK_SIZE);
    const slice = file.slice(offset, end);
    const buf = await slice.arrayBuffer();

    conn.send({ kind: "chunk", fileIndex: fi, offset, data: buf });

    const sent = end - offset;
    offset = end;
    totalSent += sent;
    onStateChange({ kind: "transferring", sent: totalSent, total: totalSize, fileName: file.name });

    if (offset >= file.size) {
      fi++;
      offset = 0;
    }
    setTimeout(next, 0);
  }
  next();
}

type IncomingMsg =
  | { kind: "meta"; files: FileMeta[]; totalSize: number }
  | { kind: "chunk"; fileIndex: number; offset: number; data: ArrayBuffer }
  | { kind: "done" };

export function setupReceiver(
  conn: DataConnection,
  onStateChange: OnStateChange,
  onFilesReceived: (files: File[]) => void
): void {
  let received: { meta: FileMeta; chunks: Map<number, Uint8Array> }[] = [];
  let totalSize = 0;
  let totalReceived = 0;

  conn.on("data", (raw) => {
    const msg = raw as IncomingMsg;
    if (msg.kind === "meta") {
      received = msg.files.map((m) => ({ meta: m, chunks: new Map() }));
      totalSize = msg.totalSize;
      totalReceived = 0;
      onStateChange({
        kind: "transferring",
        sent: 0,
        total: totalSize,
        fileName: msg.files[0]?.name ?? "",
      });
    } else if (msg.kind === "chunk") {
      const rf = received[msg.fileIndex];
      if (!rf) return;
      const bytes = new Uint8Array(msg.data);
      rf.chunks.set(msg.offset, bytes);
      totalReceived += bytes.length;
      onStateChange({
        kind: "transferring",
        sent: totalReceived,
        total: totalSize,
        fileName: rf.meta.name,
      });
    } else if (msg.kind === "done") {
      const files = received.map((rf) => {
        const sorted = Array.from(rf.chunks.entries()).sort((a, b) => a[0] - b[0]);
        const total = sorted.reduce((s, [, c]) => s + c.length, 0);
        const combined = new Uint8Array(total);
        let pos = 0;
        for (const [, c] of sorted) {
          combined.set(c, pos);
          pos += c.length;
        }
        return new File([combined], rf.meta.name, { type: rf.meta.type });
      });
      onFilesReceived(files);
      onStateChange({ kind: "completed" });
    }
  });
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
