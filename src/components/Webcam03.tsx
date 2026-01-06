// Webcam03 --- カメラ React コンポーネント
// Author: katahiromz
// License: MIT

import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import './Webcam03.css';

// Webcam03 コンポーネント
interface ScreenshotDimensions {
  width: number;
  height: number;
}

interface WebcamProps {
  audio?: boolean;
  audioConstraints?: MediaTrackConstraints;
  videoConstraints?: MediaTrackConstraints;
  onUserMedia?: (stream: MediaStream) => void;
  onUserMediaError?: (error: string | DOMException) => void;
  screenshotFormat?: "image/webp" | "image/png" | "image/jpeg";
  screenshotQuality?: number;
  mirrored?: boolean;
  forceScreenshotSourceSize?: boolean;
  minScreenshotWidth?: number;
  minScreenshotHeight?: number;
  imageSmoothing?: boolean;
  children?: (props: { getScreenshot: () => string | null }) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

interface WebcamCanvasHandle {
  getScreenshot: (dimensions?: ScreenshotDimensions) => string | null;
  getCanvas: (dimensions?: ScreenshotDimensions) => HTMLCanvasElement | null;
  getRealFacingMode: () => FacingMode | null;
  restartCamera: () => void;
  video: HTMLVideoElement | null;
}

// カメラが背面か前面か？
export type FacingMode = 'user' | 'environment';

const Webcam03 = forwardRef<WebcamCanvasHandle, WebcamProps>(
  (
    {
      audio = true,
      audioConstraints,
      videoConstraints,
      onUserMedia = () => {},
      onUserMediaError = () => {},
      screenshotFormat = "image/webp",
      screenshotQuality = 0.92,
      mirrored = false,
      forceScreenshotSourceSize = false,
      minScreenshotWidth,
      minScreenshotHeight,
      imageSmoothing = true,
      children,
      style,
      className,
      ...rest
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [hasUserMedia, setHasUserMedia] = useState(false);
    const [hasAudio, setHasAudio] = useState(false);
    const hasAudioRef = useRef<boolean>(false);
    const realFacingMode = useRef<FacingMode | null>(null);

    useEffect(() => {
      hasAudioRef.current = audio && hasAudio;
    }, [audio, hasAudio]);

    const stopMediaStream = useCallback(() => {
      console.log('stopMediaStream');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }, []);

    // カメラ起動成功時の処理
    const handleSuccess = (stream: MediaStream): void => {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // 実際に使用されているカメラのfacingModeを取得
      try {
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        realFacingMode.current = settings.facingMode as FacingMode;
      } catch (error) {
        console.warn('Failed to get camera facing mode:', error);
      }

      // audioがあるかどうか？
      try {
        const audioTrack = stream.getAudioTracks()[0];
        console.info('Audio is available');
        setHasAudio(true);
      } catch (error) {
        console.info('Failed to get audio:', error);
        setHasAudio(false);
      }

      setHasUserMedia(true);
      onUserMedia(stream);
    };

    const requestUserMedia = useCallback(async (requestAudio: boolean) => {
      console.log('requestUserMedia');

      // 現在の制約を取得
      const baseVideoConstraints = typeof videoConstraints === 'object' ? videoConstraints : {};

      const constraints: MediaStreamConstraints = {
        video: videoConstraints || true,
        audio: requestAudio ? (audioConstraints || true) : false,
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        handleSuccess(stream); // 成功
        return true;
      } catch (err) {
        console.warn("First camera attempt failed, trying fallback:", err);

        // facingMode が指定されている場合、逆のモードでリトライ
        if (typeof baseVideoConstraints === 'object' && baseVideoConstraints.facingMode) {
          const currentMode = typeof baseVideoConstraints.facingMode === 'string'
            ? baseVideoConstraints.facingMode
            : (baseVideoConstraints.facingMode as any).ideal;

          const fallbackMode = currentMode === "user" ? "environment" : "user";

          const fallbackConstraints = {
            ...constraints,
            video: { ...baseVideoConstraints, facingMode: { ideal: fallbackMode } }
          };

          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            handleSuccess(fallbackStream); // 成功
            return true;
          } catch (fallbackErr) {
            console.warn("2nd camera attempt failed, trying fallback:", err);
            if (requestAudio) {
              console.log("re-trying without audio...");
              return requestUserMedia(false);
            }
          }
        }

        // 失敗
        setHasUserMedia(false);
        onUserMediaError(err as DOMException);
        return false;
      }
    }, [stopMediaStream, JSON.stringify(videoConstraints), JSON.stringify(audioConstraints)]);

    // カメラを再起動する
    const restartCamera = useCallback(() => {
      console.log('restartCamera');
      stopMediaStream();
      requestUserMedia(hasAudioRef.current);
    }, [requestUserMedia, stopMediaStream]);

    useEffect(() => {
      console.log('useEffect');
      stopMediaStream();
      requestUserMedia(audio);
      return () => stopMediaStream();
    }, [audio, requestUserMedia, stopMediaStream]);

    const getCanvas = useCallback((dimensions?: ScreenshotDimensions): HTMLCanvasElement | null => {
      console.log('getCanvas');
      const video = videoRef.current;
      if (!video || !hasUserMedia || !video.videoHeight) return null;

      const canvas = document.createElement("canvas");
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const aspectRatio = videoWidth / videoHeight;

      let canvasWidth = dimensions?.width || videoWidth;
      let canvasHeight = dimensions?.height || videoHeight;

      if (!forceScreenshotSourceSize && !dimensions) {
        canvasWidth = minScreenshotWidth || video.clientWidth;
        canvasHeight = canvasWidth / aspectRatio;

        if (minScreenshotHeight && canvasHeight < minScreenshotHeight) {
          canvasHeight = minScreenshotHeight;
          canvasWidth = canvasHeight * aspectRatio;
        }
      }

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = imageSmoothing;
        if (mirrored) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (mirrored) {
          ctx.scale(-1, 1);
          ctx.translate(-canvas.width, 0);
        }
      }

      return canvas;
    }, [hasUserMedia, imageSmoothing, mirrored, minScreenshotWidth, minScreenshotHeight, forceScreenshotSourceSize]);

    const getScreenshot = useCallback((dimensions?: ScreenshotDimensions) => {
      console.log('getScreenshot');
      const canvas = getCanvas(dimensions);
      return canvas ? canvas.toDataURL(screenshotFormat, screenshotQuality) : null;
    }, [getCanvas, screenshotFormat, screenshotQuality]);

    useImperativeHandle(ref, () => ({
      getScreenshot,
      getCanvas,
      getRealFacingMode: () => realFacingMode.current,
      restartCamera,
      video: videoRef.current,
    }));

    const videoStyle: React.CSSProperties = {
      ...style,
      transform: `${style?.transform || ""} ${mirrored ? "scaleX(-1)" : ""}`.trim(),
    };

    return (
      <>
        <video
          autoPlay
          muted={!audio}
          playsInline
          ref={videoRef}
          style={videoStyle}
          className={className}
          {...rest}
        />
        {children?.({ getScreenshot })}
      </>
    );
  }
);

Webcam03.displayName = "Webcam03";

export default Webcam03;
