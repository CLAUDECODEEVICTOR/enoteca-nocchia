"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState, useCallback } from "react";
import { IconCamera } from "./Icons";

interface CameraStreamProps {
  onCapture: (base64: string) => void;
}

export default function CameraStream({ onCapture }: CameraStreamProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let mediaStream: MediaStream | null = null;

    async function startCamera() {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (mounted && videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch {
        if (mounted) {
          setCameraError(
            t(
              "error.camera_denied",
              "Permesso fotocamera negato. Abilita la fotocamera nelle impostazioni del browser."
            )
          );
        }
      }
    }

    startCamera();

    return () => {
      mounted = false;
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [t]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Label text is the whole point of the capture: 1400px on the long side at
    // q=0.85 keeps small print legible for Claude Vision, and still lands well
    // under the API payload cap. Anything smaller loses the fine print on the
    // label, which is exactly what the analysis depends on.
    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    onCapture(base64);
  }, [onCapture]);

  if (cameraError) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center"
        style={{
          background: "var(--color-bg)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <IconCamera size={64} className="md:w-20 md:h-20" />
        <p
          className="text-base md:text-lg max-w-md"
          style={{ color: "var(--color-text)" }}
        >
          {cameraError}
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0" style={{ background: "#000" }}>
      {/* Video stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Testo istruzione */}
      <div
        className="absolute left-0 right-0 text-center pointer-events-none"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 120px)" }}
      >
        <p
          className="text-base md:text-lg font-medium drop-shadow-lg"
          style={{ color: "#FFFFFF" }}
        >
          {t("scan.instruction")}
        </p>
      </div>

      {/* Pulsante scatto */}
      <div
        className="absolute left-0 right-0 flex justify-center"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)" }}
      >
        <button
          onClick={handleCapture}
          aria-label="Scatta foto"
          className="w-[72px] h-[72px] md:w-[88px] md:h-[88px] rounded-full border-4 transition-transform active:scale-90"
          style={{
            background: "rgba(255,255,255,0.9)",
            borderColor: "var(--color-gold)",
            boxShadow: "0 0 20px rgba(120,94,20,0.3)",
          }}
        />
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
