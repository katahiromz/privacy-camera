// App.tsx --- アプリのTypeScriptソース
// Author: katahiromz
// License: MIT
import React, { useRef, useState, useEffect, useCallback } from 'react';
import CanvasWithWebcam03, { ImageProcessData } from './components/CanvasWithWebcam03';
import { isAndroidApp, emulateInsets, saveMedia, saveMediaEx, polyfillGetUserMedia,
         getLocalDateTimeString, drawLineAsPolygon, cloneCanvas } from './libs/utils.ts';
import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import './App.css';

const IS_PRODUCTION = import.meta.env.MODE === 'production'; // 製品版か？
const SHOW_CONFIG = true; // 設定ボタンを表示するか？
const ENABLE_CONFIG = true; // 設定を有効にするか？

// 国際化(i18n)
import './libs/i18n.ts';
import { useTranslation } from 'react-i18next';

// アプリケーションのベースパスを取得
const BASE_URL = import.meta.env.BASE_URL;

const ENABLE_KEYS = true; // キーボード操作するか？
const ENABLE_FACE_DETECTION = true; // 顔認識を有効にするか？
const SHOW_CURRENT_TIME = false; // 現在の日時を表示するか？
const BACKGROUND_IS_WHITE = false; // 背景は白か？

// ダミー画像
//const dummyImageUrl = `${BASE_URL}example-qr-code.png`;
const dummyImageUrl = `${BASE_URL}dummy.jpg`;
const USE_DUMMY_IMAGE = false;
//const USE_DUMMY_IMAGE = true;

// 音声のURL
const shutterSoundUrl = `${BASE_URL}ac-camera-shutter-sound.mp3`;
const videoStartSoundUrl = `${BASE_URL}ac-video-started.mp3`;
const videoCompleteSoundUrl = `${BASE_URL}ac-video-completed.mp3`;

if (!IS_PRODUCTION) { // 本番環境ではない場合、
  emulateInsets(); // insetsをエミュレートする
}

// 古いブラウザのサポート(必要か？)
polyfillGetUserMedia();

// MediaPipe Face Landmarker の初期化
let faceLandmarker: FaceLandmarker | null = null;
let frameCount = 0; // フレーム カウンタ
let lastFaceDetectTime = 0; // 前回顔認識したときの時刻
let lastFaceDetectCount = 0; // 前回顔認識したときの顔の個数
let drawingFaceDetect = false; // 顔認識描画中か？
let detectedFaceInfo = [];
const USE_FACE_DETECTION_LOCAL_FILE = true; // ローカルファイルを使って顔認識するか？
const MIN_DETECTION_CONFIDENCE = 0.4;
const MIN_FACE_LANDMARKS = 264; // Face Landmarkerの最小ランドマーク数（263まで使用するため）
const LEFT_EYE_LEFT_CORNER = 33; // 左目の左端のランドマークインデックス
const RIGHT_EYE_RIGHT_CORNER = 263; // 右目の右端のランドマークインデックス
const EYE_MASK_EXTENSION_COEFFICIENT = 0.1; // 黒目線の拡張係数

  // 顔認識成功時の処理
const onDetectedFace = (results: FaceLandmarkerResult) => {
  // 「一瞬、顔の個数が変わった」かつ「0.8秒以上経っていない」場合は更新しない
  let now = (new Date()).getTime();
  const faceCount = results.faceLandmarks ? results.faceLandmarks.length : 0;
  if (faceCount !== lastFaceDetectCount && now < lastFaceDetectTime + 800)
    return;

  if (drawingFaceDetect) return;

  let newFaceInfo = [];
  if (results.faceLandmarks) {
    for (const landmarks of results.faceLandmarks) {
      if (!landmarks || landmarks.length < MIN_FACE_LANDMARKS) {
        console.warn("insufficient landmarks");
        continue;
      }

      // Face Landmarkerのランドマーク: 33=左目の左端, 263=右目の右端
      const leftEye = landmarks[LEFT_EYE_LEFT_CORNER];  // 左目の左端
      const rightEye = landmarks[RIGHT_EYE_RIGHT_CORNER]; // 右目の右端

      newFaceInfo.push({leftEye, rightEye});
    }
  }
  detectedFaceInfo = newFaceInfo;

  lastFaceDetectCount = faceCount;
  lastFaceDetectTime = now;
};

// MediaPipe Face Landmarker のセットアップ
const initFaceDetection = async () => {
  if (faceLandmarker || !ENABLE_FACE_DETECTION) return;

  try {
    const vision = await FilesetResolver.forVisionTasks(
      USE_FACE_DETECTION_LOCAL_FILE ? `${BASE_URL}wasm` :
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: USE_FACE_DETECTION_LOCAL_FILE ? `${BASE_URL}face_landmarker.task` :
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "IMAGE",
      numFaces: 16,
      minFaceDetectionConfidence: MIN_DETECTION_CONFIDENCE,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false
    });
  } catch (error) {
    console.warn('MediaPipe Face Landmarker initialization failed:', error);
    faceLandmarker = null;
  }
};

// アプリ起動時にFace Detectionを初期化
if (ENABLE_FACE_DETECTION) {
  initFaceDetection();
}

// 顔認識をする
const detectFaces = (data) => {
  const { ctx, x, y, width, height, src, srcWidth, srcHeight, video, canvas, isMirrored, currentZoom, offset, showCodes, qrResultsRef } = data;

  try {
    // 1フレームに1回顔検出を実行（パフォーマンス最適化）
    frameCount++;
    if (faceLandmarker && (frameCount % 1 === 0)) {
      const timestamp = performance.now();
      const results = faceLandmarker.detect(canvas);
      onDetectedFace(results);
    }

    drawingFaceDetect = true;

    // 現在保持している情報をコピーして使用（描画中の書き換え対策）
    const facesToDraw = [...detectedFaceInfo];

    // 検出結果がある場合、黒い線(黒目線)を描画
    for (const info of facesToDraw) {
      const {leftEye, rightEye} = info;

      // 正規化座標(0.0-1.0)をソース座標に変換
      let leftEyeX = leftEye.x * width, leftEyeY = leftEye.y * height;
      let rightEyeX = rightEye.x * width, rightEyeY = rightEye.y * height;

      // 目がすっぽり隠れるように微調整
      const dx = rightEyeX - leftEyeX, dy = rightEyeY - leftEyeY;
      let x0 = leftEyeX - dx * EYE_MASK_EXTENSION_COEFFICIENT, y0 = leftEyeY - dy * EYE_MASK_EXTENSION_COEFFICIENT;
      let x1 = rightEyeX + dx * EYE_MASK_EXTENSION_COEFFICIENT, y1 = rightEyeY + dy * EYE_MASK_EXTENSION_COEFFICIENT;
      const norm = Math.sqrt(dx * dx + dy * dy);

      // 黒目線の描画
      ctx.strokeStyle = '#000';
      ctx.lineWidth = norm * 0.8; // 線の幅
      ctx.lineCap = 'square';
      drawLineAsPolygon(ctx, x0, y0, x1, y1);
    }

    drawingFaceDetect = false;
  } catch (error) {
    console.warn('Error during face detection:', error);
  }
};

// 画像処理関数
const onImageProcess = async (data: ImageProcessData) => {
  const { x, y, width, height, src, srcWidth, srcHeight, video, canvas, isMirrored, currentZoom, offset, showCodes, qrResultsRef } = data;
  const ctx = canvas.getContext('2d',
    { alpha: false, desynchronized: true, willReadFrequently: false } // 速度優先
  );

  if (!ctx || width <= 0 || height <= 0) return;

  // 鏡像なら左右反転の座標変換
  if (isMirrored) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }

  if (currentZoom !== 1.0 || offset.x != 0 || offset.y != 0) {
    // 背景を塗りつぶす
    if (BACKGROUND_IS_WHITE) {
      ctx.fillStyle = 'white';
      ctx.fillRect(x, y, width, height);
    } else {
      ctx.clearRect(x, y, width, height);
    }

    // ズーム前のソースのサイズ
    const sourceWidth = srcWidth / currentZoom;
    const sourceHeight = srcHeight / currentZoom;

    // Offsetを含めた中央基準の計算
    const maxOffsetX = (srcWidth - sourceWidth) / 2;
    const maxOffsetY = (srcHeight - sourceHeight) / 2;

    // ソースの位置
    const sourceX = maxOffsetX + offset.x;
    const sourceY = maxOffsetY + offset.y;

    // イメージを拡大縮小して転送
    ctx.drawImage(
      src, Math.round(sourceX), Math.round(sourceY), sourceWidth, sourceHeight,
      x, y, width, height
    );
  } else {
    // ズームなし、パンなし
    ctx.drawImage(src, x, y, width, height);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0); // 座標変換を元に戻す

  let minxy = Math.min(width, height);
  let maxxy = Math.max(width, height);
  let avgxy = (width + height) / 2;

  if (ENABLE_FACE_DETECTION) { // 顔認識を有効にするか？
    detectFaces({...data, ctx});
  }

  if (SHOW_CURRENT_TIME) { // ちょっと日時を描画してみるか？
    let text = getLocalDateTimeString();
    ctx.font = `${minxy * 0.05}px monospace, san-serif`;
    let measure = ctx.measureText(text);
    const margin = minxy * 0.015;
    let x0 = x + width - measure.width - margin, y0 = height - margin;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = minxy * 0.01;
    ctx.strokeText(text, x0, y0);
    ctx.fillStyle = "#0f0";
    ctx.fillText(text, x0, y0);
  }
};

// アプリ
function App() {
  const { t } = useTranslation(); // 翻訳用
  const canvasWithCamera = useRef<CanvasWithWebcam03>(null);

  // 設定をする
  const doConfig = () => {
    if (!ENABLE_CONFIG)
      return;
    alert(t('camera_app_info'));
  };

  useEffect(() => {
    //console.log(canvasWithCamera.current.canvas);
    //canvasWithCamera.current.setZoomRatio(2);
    //console.log(canvasWithCamera.current.getZoomRatio());
  }, []);

  // 物理の音量ボタンを押されたら撮影
  useEffect(() => {
    // ハンドラ関数の定義
    const handlePhysicalVolumeButton = (e: any) => {
      // Android側から CustomEvent("PhysicalVolumeButton", { detail: ... }) で送られてくることを想定
      const { volumeType } = e.detail || {};
      console.log(`Volume: ${volumeType}`);

      // 音量ボタンでシャッターを切るなど
      canvasWithCamera.current?.takePhoto();
    };

    // イベントリスナーの登録
    window.addEventListener('PhysicalVolumeButton', handlePhysicalVolumeButton, { passive: false });

    // クリーンアップ（コンポーネント消滅時に解除）
    return () => {
      window.removeEventListener('PhysicalVolumeButton', handlePhysicalVolumeButton);
    };
  }, []); // 初回マウント時のみ実行

  useEffect(() => {
    // Android側から呼ばれるグローバル関数を定義
    if ((window as any).onPhysicalVolumeButton) {
      (window as any).onPhysicalVolumeButton = () => {
        canvasWithCamera.current?.takePhoto();
      };
    }
    // コンポーネントがアンマウントされる時にクリーンアップ
    return () => {
      delete (window as any).onPhysicalVolumeButton;
    };
  }, []);

  // キーボード操作を可能にする
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!ENABLE_KEYS) return;
      switch(event.key) {
      case '+': // ズームイン
      case ';': // (日本語キーボード対応用)
        if (!event.ctrlKey && !event.altKey) { // CtrlキーやAltキーが押されていない？
          event.preventDefault();
          canvasWithCamera.current?.zoomIn(); // ズームイン
        }
        break;
      case '-': // ズームアウト
        if (!event.ctrlKey && !event.altKey) { // CtrlキーやAltキーが押されていない？
          event.preventDefault();
          canvasWithCamera.current?.zoomOut(); // ズームアウト
        }
        break;
      case ' ': // スペース キー
        if (!event.ctrlKey && !event.altKey) { // CtrlキーやAltキーが押されていない？
          event.preventDefault();
          canvasWithCamera.current?.takePhoto(); // 写真撮影
        }
        break;
      case 'Enter': // Enterキー
        if (!event.ctrlKey && !event.altKey) { // CtrlキーやAltキーが押されていない？
          event.preventDefault();
          // 録画開始・録画停止を切り替える
          if (canvasWithCamera.current?.isRecording()) {
            canvasWithCamera.current?.stopRecording();
          } else {
            canvasWithCamera.current?.startRecording();
          }
        }
        break;
      // パン操作 (矢印)
      case 'ArrowUp':
        event.preventDefault();
        canvasWithCamera.current?.panUp();
        break;
      case 'ArrowDown':
        event.preventDefault();
        canvasWithCamera.current?.panDown();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        canvasWithCamera.current?.panRight();
        break;
      case 'ArrowRight':
        event.preventDefault();
        canvasWithCamera.current?.panLeft();
        break;
      default:
        //console.log(event.key);
        break;
      }
    };

    document.body.addEventListener('keydown', handleKeyDown);
    return () => document.body.removeEventListener('keydown', handleKeyDown);
  }, []);

  // メッセージを処理する
  useEffect(() => {
    const onMessage = (e) => {
      switch (e.data) {
      case 'go_back': // Android標準の「戻る」ボタンをサポートする。
        if (window.android) {
          e.preventDefault(); // イベントのデフォルトの処理をスキップ。
          // 可能ならばアプリを閉じる(完全に終了する訳ではない)
          try { window.android.finishApp(); } catch (err) { }
        }
        break;
      case 'onAppResume': // Androidアプリ再開時の処理を行う。
        if (window.android) {
          e.preventDefault(); // イベントのデフォルトの処理をスキップ。
          canvasWithCamera.current?.onAppResume();
        }
        break;
      default:
        console.log(e.data);
        break;
      }
    };

    window.addEventListener('message', onMessage, { passive: false });
    return () => {
      window.removeEventListener('message', onMessage);
    }
  }, []);

  return (
    <CanvasWithWebcam03
      ref={canvasWithCamera}
      width="100%"
      height="100%"
      shutterSoundUrl={shutterSoundUrl}
      videoStartSoundUrl={videoStartSoundUrl}
      videoCompleteSoundUrl={videoCompleteSoundUrl}
      downloadFile={isAndroidApp ? saveMediaEx : saveMedia}
      eventTarget={document.body}
      autoMirror={false}
      onImageProcess={onImageProcess}
      dummyImageSrc={ USE_DUMMY_IMAGE ? dummyImageUrl : null }
      showConfig={SHOW_CONFIG}
      showCodeReader={false}
      doConfig={doConfig}
      aria-label={t('camera_app')}
    />
  );
}

export default App;