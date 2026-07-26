import { useEffect, useRef, useState } from "react";
import type Peer from "peerjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download, FolderDown, Radio } from "lucide-react";
import {
  CODE_ALPHABET,
  downloadFile,
  normalizeCode,
  PEER_PREFIX,
  saveAllToDirectory,
  setupReceiver,
  supportsDirectorySave,
  type ReceivedFile,
  type TransferState,
} from "@/lib/peer";
import { TransferProgress } from "./TransferProgress";

const CODE_LENGTH = 6;
const KEYPAD_ROWS = [
  Array.from(CODE_ALPHABET.slice(0, 8)),
  Array.from(CODE_ALPHABET.slice(8, 16)),
  Array.from(CODE_ALPHABET.slice(16, 24)),
  Array.from(CODE_ALPHABET.slice(24)),
];

interface ReceiveFlowProps {
  onBack: () => void;
}

export function ReceiveFlow({ onBack }: ReceiveFlowProps) {
  const [codeInput, setCodeInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<TransferState>({ kind: "idle" });
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const canSaveFolder = supportsDirectorySave();
  const hasFolder = receivedFiles.some((rf) => rf.path.includes("/"));
  const peerRef = useRef<Peer | null>(null);

  const normalizedCode = normalizeCode(codeInput).slice(0, CODE_LENGTH);

  useEffect(() => {
    return () => {
      peerRef.current?.destroy();
    };
  }, []);


  async function connect() {
    const code = normalizedCode;
    if (code.length < 4) {
      setState({ kind: "error", message: "Please enter a valid code." });
      return;
    }

    setConnected(true);
    setState({ kind: "connecting" });

    const { default: PeerCtor } = await import("peerjs");
    const peer = new PeerCtor();
    peerRef.current = peer;

    peer.on("open", () => {
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true });

      conn.on("open", () => {
        setupReceiver(conn, setState, (files) => setReceivedFiles(files));
      });

      conn.on("error", () => {
        setState({
          kind: "error",
          message: "Could not connect. Check the code and try again.",
        });
      });
    });

    peer.on("error", (err) => {
      const type = (err as { type?: string }).type;
      if (type === "peer-unavailable") {
        setState({
          kind: "error",
          message: "No sender is waiting with that code.",
        });
      } else {
        setState({ kind: "error", message: err.message || "Connection service error" });
      }
    });
  }

  function addCodeChar(char: string) {
    setCodeInput((current) => {
      const next = normalizeCode(current + char).slice(0, CODE_LENGTH);
      setState({ kind: "idle" });
      return next;
    });
  }

  function removeCodeChar() {
    setCodeInput((current) => normalizeCode(current).slice(0, -1));
    setState({ kind: "idle" });
  }

  useEffect(() => {
    if (connected) return;

    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      if (key === "enter") {
        connect();
        return;
      }

      if (key === "backspace" || key === "delete") {
        event.preventDefault();
        removeCodeChar();
        return;
      }

      if (CODE_ALPHABET.includes(key)) {
        event.preventDefault();
        addCodeChar(key);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [connected, normalizedCode]);

  function reset() {
    peerRef.current?.destroy();
    peerRef.current = null;
    setConnected(false);
    setCodeInput("");
    setState({ kind: "idle" });
    setReceivedFiles([]);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Receive files
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!connected && (
          <>
            <div className="space-y-3">
              <Label>Enter share code</Label>
              <div className="grid grid-cols-6 gap-2" aria-label="Share code">
                {Array.from({ length: CODE_LENGTH }).map((_, index) => (
                  <div
                    key={index}
                    className="flex aspect-square items-center justify-center rounded-md border border-input bg-background font-mono text-xl font-semibold uppercase text-foreground shadow-sm"
                  >
                    {normalizedCode[index] ?? ""}
                  </div>
                ))}
              </div>
              <div className="space-y-2" aria-label="Code keypad">
                {KEYPAD_ROWS.map((row, rowIndex) => (
                  <div key={rowIndex} className="grid grid-cols-8 gap-1.5">
                    {row.map((char) => (
                      <Button
                        key={char}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => addCodeChar(char)}
                        disabled={normalizedCode.length >= CODE_LENGTH}
                        className="h-10 px-0 font-mono text-base uppercase"
                      >
                        {char}
                      </Button>
                    ))}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={removeCodeChar}
                disabled={normalizedCode.length === 0}
                className="w-full"
              >
                Delete last character
              </Button>
            </div>
            <Button onClick={connect} disabled={!normalizedCode} className="w-full">
              Connect
            </Button>
            {state.kind === "error" && <p className="text-sm text-destructive">{state.message}</p>}
          </>
        )}

        {connected && <TransferProgress state={state} />}

        {receivedFiles.length > 0 && (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Received {hasFolder ? "items" : "files"}</p>
              {canSaveFolder && hasFolder && (
                <Button
                  size="sm"
                  onClick={async () => {
                    setSavingAll(true);
                    try {
                      await saveAllToDirectory(receivedFiles);
                    } catch {
                      // user cancelled or error
                    } finally {
                      setSavingAll(false);
                    }
                  }}
                  disabled={savingAll}
                  className="gap-1"
                >
                  <FolderDown className="h-4 w-4" />
                  {savingAll ? "Saving…" : "Save folder"}
                </Button>
              )}
            </div>
            {hasFolder && !canSaveFolder && (
              <p className="text-xs text-muted-foreground">
                Your browser can't recreate folders on save. Files below keep their names; open a
                Chromium-based browser (Chrome/Edge) to save with the original folder structure.
              </p>
            )}
            <ul className="space-y-2">
              {receivedFiles.map((rf) => (
                <li key={rf.path} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm" title={rf.path}>{rf.path}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadFile(rf.file, rf.file.name)}
                    className="gap-1 shrink-0"
                  >
                    <Download className="h-4 w-4" />
                    Save
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.kind === "error" && connected && (
          <Button variant="outline" onClick={reset} className="w-full">
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
