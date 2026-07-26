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
export const PEER_OPTIONS = {
  debug: 0,
  config: {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    sdpSemantics: "unified-plan",
  },
};

const RECEIVER_READY_MESSAGE = "directdrop:receiver-ready";
type DataConnectionRuntime = DataConnection & {
  _open?: boolean;
  dataChannel?: RTCDataChannel;
};

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
  const metas: FileMeta[] = files.map((f) => ({
    name: f.name,
    size: f.size,
    type: f.type,
    path: getFilePath(f),
  }));
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
  | { kind: typeof RECEIVER_READY_MESSAGE }
  | { kind: "meta"; files: FileMeta[]; totalSize: number }
  | { kind: "chunk"; fileIndex: number; offset: number; data: ArrayBuffer }
  | { kind: "done" };

export function sendReceiverReady(conn: DataConnection): void {
  conn.send({ kind: RECEIVER_READY_MESSAGE });
}

export function isReceiverReady(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    (data as { kind?: unknown }).kind === RECEIVER_READY_MESSAGE
  );
}

export function waitForDataConnectionOpen(conn: DataConnection, timeoutMs = 25000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let pollId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const runtimeConn = conn as DataConnectionRuntime;

    const cleanup = () => {
      if (pollId) clearInterval(pollId);
      if (timeoutId) clearTimeout(timeoutId);
    };

    const resolveReady = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const rejectOnce = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const markReadyIfOpen = () => {
      if (conn.open || runtimeConn.dataChannel?.readyState === "open") {
        runtimeConn._open = true;
        resolveReady();
      }
    };

    markReadyIfOpen();
    if (settled) return;

    conn.on("open", markReadyIfOpen);
    conn.on("error", () => rejectOnce("Peer-to-peer connection failed. Try again on the same network."));
    conn.on("close", () => rejectOnce("Peer-to-peer connection closed before it was ready."));
    conn.on("iceStateChanged", (iceState) => {
      if (iceState === "failed" || iceState === "closed") {
        rejectOnce("Peer-to-peer connection failed. Try again on the same network.");
      } else {
        markReadyIfOpen();
      }
    });

    pollId = setInterval(markReadyIfOpen, 100);
    timeoutId = setTimeout(
      () => rejectOnce("Peer-to-peer connection timed out. Try again with both browsers open."),
      timeoutMs
    );
  });
}

export function setupReceiver(
  conn: DataConnection,
  onStateChange: OnStateChange,
  onFilesReceived: (files: ReceivedFile[]) => void
): void {
  let received: { meta: FileMeta; chunks: Map<number, Uint8Array> }[] = [];
  let totalSize = 0;
  let totalReceived = 0;

  conn.on("data", (raw) => {
    const msg = raw as IncomingMsg;
    if (msg.kind === RECEIVER_READY_MESSAGE) {
      return;
    }
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
      const files: ReceivedFile[] = received.map((rf) => {
        const sorted = Array.from(rf.chunks.entries()).sort((a, b) => a[0] - b[0]);
        const total = sorted.reduce((s, [, c]) => s + c.length, 0);
        const combined = new Uint8Array(total);
        let pos = 0;
        for (const [, c] of sorted) {
          combined.set(c, pos);
          pos += c.length;
        }
        return {
          file: new File([combined], rf.meta.name, { type: rf.meta.type }),
          path: rf.meta.path || rf.meta.name,
        };
      });
      onFilesReceived(files);
      onStateChange({ kind: "completed" });
    }
  });
}

export function downloadFile(file: File, filename?: string): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type DirHandle = {
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) => Promise<DirHandle>;
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
  }>;
};

export function supportsDirectorySave(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

export async function saveAllToDirectory(files: ReceivedFile[]): Promise<void> {
  const picker = (window as unknown as {
    showDirectoryPicker: () => Promise<DirHandle>;
  }).showDirectoryPicker;
  const root = await picker();
  for (const { file, path } of files) {
    const parts = path.split("/").filter(Boolean);
    const fileName = parts.pop() ?? file.name;
    let dir: DirHandle = root;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
  }
}
