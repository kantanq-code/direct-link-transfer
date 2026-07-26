export type FileMeta = {
  name: string;
  size: number;
  type: string;
};

export type TransferState =
  | { kind: "idle" }
  | { kind: "signaling"; message: string }
  | { kind: "connecting" }
  | { kind: "transferring"; sent: number; total: number; fileName: string }
  | { kind: "completed" }
  | { kind: "error"; message: string };

export type OnStateChange = (state: TransferState) => void;

const CHUNK_SIZE = 16 * 1024; // 16 KB

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

export async function createOffer(
  pc: RTCPeerConnection
): Promise<{ offer: RTCSessionDescriptionInit; channel: RTCDataChannel }> {
  const channel = pc.createDataChannel("fileTransfer", {
    ordered: true,
  });
  channel.binaryType = "arraybuffer";

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  const completeOffer = pc.localDescription;
  if (!completeOffer) {
    throw new Error("Failed to create offer");
  }
  return { offer: completeOffer, channel };
}

export async function createAnswer(
  pc: RTCPeerConnection,
  offer: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGathering(pc);

  const completeAnswer = pc.localDescription;
  if (!completeAnswer) {
    throw new Error("Failed to create answer");
  }
  return completeAnswer;
}

export async function acceptAnswer(
  pc: RTCPeerConnection,
  answer: RTCSessionDescriptionInit
): Promise<void> {
  await pc.setRemoteDescription(answer);
}

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    function onComplete() {
      if (pc.iceGatheringState === "complete") {
        cleanup();
        resolve();
      }
    }

    function cleanup() {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onComplete);
    }

    pc.addEventListener("icegatheringstatechange", onComplete);
  });
}

export function sendFiles(
  channel: RTCDataChannel,
  files: File[],
  onStateChange: OnStateChange
): void {
  if (channel.readyState !== "open") {
    onStateChange({ kind: "error", message: "Data channel is not open" });
    return;
  }

  const metas: FileMeta[] = files.map((f) => ({ name: f.name, size: f.size, type: f.type }));
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  // Send metadata as JSON with a marker byte prefix: 0 = metadata, 1 = chunk
  const metaPayload = JSON.stringify({ files: metas, totalSize });
  const metaBuffer = new TextEncoder().encode(metaPayload);
  const metaPacket = new Uint8Array(1 + metaBuffer.length);
  metaPacket[0] = 0;
  metaPacket.set(metaBuffer, 1);
  channel.send(metaPacket);

  let currentFileIndex = 0;
  let currentOffset = 0;
  let totalSent = 0;

  function sendNextChunk() {
    if (currentFileIndex >= files.length) {
      // Send empty marker to indicate completion
      channel.send(new Uint8Array([2]));
      onStateChange({ kind: "completed" });
      return;
    }

    const file = files[currentFileIndex];
    const end = Math.min(file.size, currentOffset + CHUNK_SIZE);
    const slice = file.slice(currentOffset, end);

    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const packet = new Uint8Array(1 + 4 + 4 + arrayBuffer.byteLength);
      const view = new DataView(packet.buffer);
      packet[0] = 1; // chunk marker
      view.setUint32(1, currentFileIndex, false);
      view.setUint32(5, currentOffset, false);
      packet.set(new Uint8Array(arrayBuffer), 9);

      channel.send(packet);

      const sent = end - currentOffset;
      currentOffset = end;
      totalSent += sent;

      onStateChange({
        kind: "transferring",
        sent: totalSent,
        total: totalSize,
        fileName: file.name,
      });

      if (currentOffset >= file.size) {
        currentFileIndex++;
        currentOffset = 0;
      }

      // Use setTimeout to keep the UI responsive and avoid flooding the channel
      setTimeout(sendNextChunk, 0);
    };
    reader.onerror = () => {
      onStateChange({ kind: "error", message: `Failed to read file: ${file.name}` });
    };
    reader.readAsArrayBuffer(slice);
  }

  sendNextChunk();
}

export type ReceivedFile = {
  meta: FileMeta;
  chunks: Map<number, Uint8Array>;
};

export function setupReceiver(
  pc: RTCPeerConnection,
  onStateChange: OnStateChange,
  onFilesReceived: (files: File[]) => void
): void {
  let receivedFiles: ReceivedFile[] = [];
  let totalSize = 0;
  let totalReceived = 0;

  pc.addEventListener("datachannel", (event) => {
    const channel = event.channel;
    channel.binaryType = "arraybuffer";

    channel.addEventListener("open", () => {
      onStateChange({ kind: "connecting" });
    });

    channel.addEventListener("message", (event) => {
      const data = event.data as ArrayBuffer;
      const bytes = new Uint8Array(data);
      const marker = bytes[0];

      if (marker === 0) {
        // Metadata
        const json = new TextDecoder().decode(bytes.slice(1));
        const meta = JSON.parse(json) as { files: FileMeta[]; totalSize: number };
        receivedFiles = meta.files.map((m) => ({ meta: m, chunks: new Map() }));
        totalSize = meta.totalSize;
        totalReceived = 0;
        onStateChange({ kind: "transferring", sent: 0, total: totalSize, fileName: meta.files[0]?.name ?? "" });
      } else if (marker === 1) {
        // Chunk
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const fileIndex = view.getUint32(1, false);
        const offset = view.getUint32(5, false);
        const chunk = bytes.slice(9);

        const receivedFile = receivedFiles[fileIndex];
        if (!receivedFile) return;

        receivedFile.chunks.set(offset, chunk);
        totalReceived += chunk.length;

        onStateChange({
          kind: "transferring",
          sent: totalReceived,
          total: totalSize,
          fileName: receivedFile.meta.name,
        });
      } else if (marker === 2) {
        // Completion
        const files: File[] = receivedFiles.map((rf) => {
          const sorted = Array.from(rf.chunks.entries()).sort((a, b) => a[0] - b[0]);
          const totalLength = sorted.reduce((sum, [, c]) => sum + c.length, 0);
          const combined = new Uint8Array(totalLength);
          let pos = 0;
          for (const [, chunk] of sorted) {
            combined.set(chunk, pos);
            pos += chunk.length;
          }
          return new File([combined], rf.meta.name, { type: rf.meta.type });
        });
        onFilesReceived(files);
        onStateChange({ kind: "completed" });
      }
    });

    channel.addEventListener("error", () => {
      onStateChange({ kind: "error", message: "Data channel error" });
    });
  });
}

export function waitForChannelOpen(channel: RTCDataChannel): Promise<RTCDataChannel> {
  return new Promise((resolve, reject) => {
    if (channel.readyState === "open") {
      resolve(channel);
      return;
    }
    channel.addEventListener("open", () => resolve(channel), { once: true });
    channel.addEventListener("error", (e) => reject(e), { once: true });
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
