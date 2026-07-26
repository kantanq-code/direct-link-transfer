import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Send, Upload } from "lucide-react";
import {
  createOffer,
  acceptAnswer,
  createPeerConnection,
  sendFiles,
  waitForChannelOpen,
  type TransferState,
} from "@/lib/webrtc";
import { compressString, decompressString } from "@/lib/compress";
import { QRCodeDisplay } from "./QRCodeDisplay";
import { QRScanner } from "./QRScanner";
import { TransferProgress } from "./TransferProgress";

interface SendFlowProps {
  onBack: () => void;
}

export function SendFlow({ onBack }: SendFlowProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [offerData, setOfferData] = useState<string | null>(null);
  const [answerData, setAnswerData] = useState<string | null>(null);
  const [state, setState] = useState<TransferState>({ kind: "idle" });
  const pcRef = useRef<RTCPeerConnection | null>(null);

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files;
    if (!selected || selected.length === 0) return;
    setFiles(Array.from(selected));
  }

  async function generateOffer() {
    if (files.length === 0) return;

    setState({ kind: "signaling", message: "Generating connection offer..." });

    const pc = createPeerConnection();
    pcRef.current = pc;

    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "connected") {
        setState({ kind: "connecting" });
      } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setState({ kind: "error", message: "Peer-to-peer connection failed. Try again on the same network." });
      }
    });

    try {
      const { offer, channel } = await createOffer(pc);
      const compressed = await compressString(JSON.stringify(offer));
      setOfferData(compressed);
      setState({ kind: "signaling", message: "Show this QR code to the receiver, then scan their answer." });

      waitForChannelOpen(channel).then(() => {
        sendFiles(channel, files, setState);
      }).catch(() => {
        setState({ kind: "error", message: "Data channel failed to open." });
      });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Failed to create offer" });
    }
  }

  async function handleAnswerScan(data: string) {
    if (!pcRef.current || answerData) return;

    try {
      const decompressed = await decompressString(data);
      const answer = JSON.parse(decompressed) as RTCSessionDescriptionInit;
      await acceptAnswer(pcRef.current, answer);
      setAnswerData(data);
      setState({ kind: "connecting" });
    } catch (err) {
      setState({ kind: "error", message: "Invalid answer QR code. Please try again." });
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send files
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!offerData && (
          <>
            <div className="space-y-2">
              <Label htmlFor="file-input">Choose files</Label>
              <Input
                id="file-input"
                type="file"
                multiple
                onChange={handleFileSelect}
                className="cursor-pointer"
              />
              {files.length > 0 && (
                <ul className="text-sm text-muted-foreground">
                  {files.map((f) => (
                    <li key={f.name}>{f.name}</li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              onClick={generateOffer}
              disabled={files.length === 0}
              className="w-full gap-2"
            >
              <Upload className="h-4 w-4" />
              Generate QR code
            </Button>
          </>
        )}

        {offerData && !answerData && (
          <div className="space-y-6">
            <QRCodeDisplay data={offerData} label="Show this code to the receiver" />
            <div className="space-y-2">
              <p className="text-center text-sm font-medium">Now scan the receiver&apos;s answer code</p>
              <QRScanner onScan={handleAnswerScan} label="Point camera at receiver&apos;s answer QR" />
            </div>
          </div>
        )}

        {answerData && <TransferProgress state={state} />}
      </CardContent>
    </Card>
  );
}
