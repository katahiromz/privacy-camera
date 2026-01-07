// App.tsx --- アプリのTypeScriptソース
// Author: katahiromz
// License: MIT
import React, { useRef, useState, useEffect, useCallback } from 'react';
import CanvasWithWebcam03, { ImageProcessData } from './components/CanvasWithWebcam03';
import SettingsPage, { PrivacyMode } from './components/SettingsPage';
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
let offscreenCanvas: HTMLCanvasElement | null = null; // オフスクリーンキャンバス
let tempBlurCanvas: HTMLCanvasElement | null = null; // ぼかし用の一時キャンバス
const USE_FACE_DETECTION_LOCAL_FILE = true; // ローカルファイルを使って顔認識するか？
const MIN_DETECTION_CONFIDENCE = 0.4;
const MIN_FACE_LANDMARKS = 264; // Face Landmarkerの最小ランドマーク数（263まで使用するため）
const LEFT_EYE_LEFT_CORNER = 33; // 左目の左端のランドマークインデックス
const RIGHT_EYE_RIGHT_CORNER = 263; // 右目の右端のランドマークインデックス
const EYE_MASK_EXTENSION_COEFFICIENT = 0.4; // 黒目線の拡張係数
const FACE_PADDING_COEFFICIENT = 0.2; // 顔のパディング係数
const BLACKOUT_LINE_WIDTH_COEFFICIENT = 0.1; // 黒塗りモードの線の幅係数
const PRIVACY_MODE_KEY = 'privacyMode'; // localStorageのキー

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
      runningMode: "VIDEO",
      numFaces: 16,
      minFaceDetectionConfidence: MIN_DETECTION_CONFIDENCE,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      min_face_detection_confidence: 0.1,
      min_face_presence_confidence: 0.1,
      min_tracking_confidence: 0.1,
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
const detectFaces = (canvas: HTMLCanvasElement) => {
  try {
    // 1フレームに1回顔検出を実行（パフォーマンス最適化）
    frameCount++;
    if (faceLandmarker && (frameCount % 1 === 0)) {
      const timestamp = performance.now();
      const results = faceLandmarker.detectForVideo(canvas, timestamp);

      let faceInfo = [];
      if (results.faceLandmarks) {
        for (const landmarks of results.faceLandmarks) {
          if (!landmarks || landmarks.length < MIN_FACE_LANDMARKS) {
            console.warn("insufficient landmarks");
            continue;
          }

          // Face Landmarkerのランドマーク: 33=左目の左端, 263=右目の右端
          const leftEye = landmarks[LEFT_EYE_LEFT_CORNER];  // 左目の左端
          const rightEye = landmarks[RIGHT_EYE_RIGHT_CORNER]; // 右目の右端

          faceInfo.push({leftEye, rightEye, landmarks});
        }
      }
      return faceInfo;
    }
    return [];
  } catch (error) {
    console.warn('Error during face detection:', error);
    return [];
  }
};

let oldFaceCount = 0; // 古い顔の個数
let oldFaceInfo = null; // 古い顔情報
let faceDetectTime = 0; // 顔情報が更新された日時

// アプリ
function App() {
  const { t } = useTranslation(); // 翻訳用
  const canvasWithCamera = useRef<CanvasWithWebcam03>(null);
  const qrResultsRef = useRef([]); // QRコード読み取り結果（CanvasWithWebcam03に渡すため）

  // プライバシーモードの状態管理
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>(() => {
    try {
      const saved = localStorage.getItem(PRIVACY_MODE_KEY);
      return (saved === 'eyeMask' || saved === 'faceBlur' || saved === 'blackout' || saved === 'mosaic') ? saved : 'eyeMask';
    } catch (error) {
      console.warn('localStorage not available:', error);
      return 'eyeMask';
    }
  });

  // プライバシーモードのRefを作成して常に最新の値を参照
  const privacyModeRef = useRef(privacyMode);
  useEffect(() => {
    privacyModeRef.current = privacyMode;
  }, [privacyMode]);

  // 設定ページの表示状態
  const [showSettings, setShowSettings] = useState(false);

  // プライバシーモード変更時の処理
  const handlePrivacyModeChange = (mode: PrivacyMode) => {
    setPrivacyMode(mode);
    try {
      localStorage.setItem(PRIVACY_MODE_KEY, mode);
    } catch (error) {
      console.warn('localStorage not available:', error);
    }
  };

  // 画像処理関数
  const onImageProcess = useCallback(async (data: ImageProcessData) => {
    const { x, y, width, height, src, srcWidth, srcHeight, video, canvas, isMirrored, currentZoom, offset, showCodes } = data;
    const ctx = canvas.getContext('2d', { alpha: false }); // 速度優先

    if (!ctx || width <= 0 || height <= 0) return;

    // オフスクリーンキャンバスを作成または再利用
    if (!offscreenCanvas || offscreenCanvas.width !== canvas.width || offscreenCanvas.height !== canvas.height) {
      offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = canvas.width;
      offscreenCanvas.height = canvas.height;
    }
    const offscreenCtx = offscreenCanvas.getContext('2d', { alpha: false });

    if (!offscreenCtx) return;

    // 鏡像なら左右反転の座標変換
    if (isMirrored) {
      offscreenCtx.translate(width, 0);
      offscreenCtx.scale(-1, 1);
    }

    if (currentZoom !== 1.0 || offset.x != 0 || offset.y != 0) {
      // 背景を塗りつぶす
      if (BACKGROUND_IS_WHITE) {
        offscreenCtx.fillStyle = 'white';
        offscreenCtx.fillRect(x, y, width, height);
      } else {
        offscreenCtx.clearRect(x, y, width, height);
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
      offscreenCtx.drawImage(
        src, Math.round(sourceX), Math.round(sourceY), sourceWidth, sourceHeight,
        x, y, width, height
      );
    } else {
      // ズームなし、パンなし
      offscreenCtx.drawImage(src, x, y, width, height);
    }

    offscreenCtx.setTransform(1, 0, 0, 1, 0, 0); // 座標変換を元に戻す

    let minxy = Math.min(width, height);
    let maxxy = Math.max(width, height);
    let avgxy = (width + height) / 2;

    if (ENABLE_FACE_DETECTION) { // 顔認識を有効にするか？
      let faceInfo = detectFaces(offscreenCanvas);
      const now = performance.now();

      if (faceInfo.length !== oldFaceCount && now < faceDetectTime + 500) {
        // 急に顔の数が変わったときは、しばらく古い情報を信用する
        faceInfo = oldFaceInfo;
      } else {
        // 顔の個数が同じか、時間が経ったら新しい情報を信用する
        oldFaceInfo = faceInfo;
        oldFaceCount = faceInfo.length;
        faceDetectTime = now;
      }

      // 検出結果がある場合、プライバシーモードに応じて処理
      for (const info of faceInfo) {
        const {leftEye, rightEye, landmarks} = info;

        // 正規化座標(0.0-1.0)をソース座標に変換
        let leftEyeX = leftEye.x * width, leftEyeY = leftEye.y * height;
        let rightEyeX = rightEye.x * width, rightEyeY = rightEye.y * height;

        // 最新のprivacyModeを取得
        const currentPrivacyMode = privacyModeRef.current;
        if (currentPrivacyMode === 'eyeMask') {
          // 黒目線モード
          // 目がすっぽり隠れるように微調整
          const dx = rightEyeX - leftEyeX, dy = rightEyeY - leftEyeY;
          let x0 = leftEyeX - dx * EYE_MASK_EXTENSION_COEFFICIENT, y0 = leftEyeY - dy * EYE_MASK_EXTENSION_COEFFICIENT;
          let x1 = rightEyeX + dx * EYE_MASK_EXTENSION_COEFFICIENT, y1 = rightEyeY + dy * EYE_MASK_EXTENSION_COEFFICIENT;
          const norm = Math.sqrt(dx * dx + dy * dy);

          // 黒目線の描画
          offscreenCtx.strokeStyle = '#000';
          offscreenCtx.lineWidth = norm * 0.8; // 線の幅
          offscreenCtx.lineCap = 'square';
          drawLineAsPolygon(offscreenCtx, x0, y0, x1, y1);
        } else if (currentPrivacyMode === 'faceBlur') {
          // 顔ぼかしモード
          // 顔全体の境界ボックスを計算
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const landmark of landmarks) {
            const lx = landmark.x * width;
            const ly = landmark.y * height;
            minX = Math.min(minX, lx);
            minY = Math.min(minY, ly);
            maxX = Math.max(maxX, lx);
            maxY = Math.max(maxY, ly);
          }

          // 余白を追加
          const padding = (maxX - minX) * FACE_PADDING_COEFFICIENT;
          minX = Math.max(0, minX - padding);
          minY = Math.max(0, minY - padding);
          maxX = Math.min(width, maxX + padding);
          maxY = Math.min(height, maxY + padding);

          const faceWidth = maxX - minX;
          const faceHeight = maxY - minY;

          // 一時キャンバスを作成または再利用（メモリ効率のため、大きすぎる場合は再作成）
          const MAX_TEMP_CANVAS_SIZE = 2000; // 最大サイズ（ピクセル）
          if (!tempBlurCanvas ||
              tempBlurCanvas.width < faceWidth ||
              tempBlurCanvas.height < faceHeight ||
              (tempBlurCanvas.width > MAX_TEMP_CANVAS_SIZE && faceWidth < MAX_TEMP_CANVAS_SIZE / 2) ||
              (tempBlurCanvas.height > MAX_TEMP_CANVAS_SIZE && faceHeight < MAX_TEMP_CANVAS_SIZE / 2)) {
            tempBlurCanvas = document.createElement('canvas');
            tempBlurCanvas.width = Math.ceil(Math.max(faceWidth, 100)); // 最小サイズを確保
            tempBlurCanvas.height = Math.ceil(Math.max(faceHeight, 100));
          }
          const tempCtx = tempBlurCanvas.getContext('2d');

          if (tempCtx) {
            // 一時キャンバスをクリア
            tempCtx.clearRect(0, 0, tempBlurCanvas.width, tempBlurCanvas.height);
            // 顔領域をコピー
            tempCtx.drawImage(offscreenCanvas, minX, minY, faceWidth, faceHeight, 0, 0, faceWidth, faceHeight);

            // ぼかしフィルタを適用
            const blurRadius = Math.ceil(faceWidth * 0.08);
            offscreenCtx.filter = `blur(${blurRadius}px)`;
            offscreenCtx.drawImage(tempBlurCanvas, 0, 0, faceWidth, faceHeight, minX, minY, faceWidth, faceHeight);
            offscreenCtx.filter = 'none'; // フィルタをリセット
          }
        } else if (currentPrivacyMode === 'blackout') {
          // 黒塗りモード
          // 顔全体の境界ボックスを計算
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const landmark of landmarks) {
            const lx = landmark.x * width;
            const ly = landmark.y * height;
            minX = Math.min(minX, lx);
            minY = Math.min(minY, ly);
            maxX = Math.max(maxX, lx);
            maxY = Math.max(maxY, ly);
          }

          // 余白を追加（faceBlurと同じパディング）
          const padding = (maxX - minX) * FACE_PADDING_COEFFICIENT;
          minX = Math.max(0, minX - padding);
          minY = Math.max(0, minY - padding);
          maxX = Math.min(width, maxX + padding);
          maxY = Math.min(height, maxY + padding);

          // 楕円の中心座標とサイズを計算
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const radiusX = (maxX - minX) / 2;
          const radiusY = (maxY - minY) / 2;

          // 顔の角度を計算（目の位置から）
          const dx = rightEyeX - leftEyeX;
          const dy = rightEyeY - leftEyeY;
          const angle = Math.atan2(dy, dx);

          // 黒い楕円を描画
          offscreenCtx.save();
          offscreenCtx.translate(centerX, centerY);
          offscreenCtx.rotate(angle);
          offscreenCtx.beginPath();
          offscreenCtx.ellipse(0, 0, radiusX, radiusY, 0, 0, 2 * Math.PI);
          offscreenCtx.fillStyle = '#000';
          offscreenCtx.fill();
          // 赤い線を描画
          offscreenCtx.strokeStyle = '#f00';
          offscreenCtx.lineWidth = (radiusX + radiusY) * 0.01;
          offscreenCtx.stroke();
          // 「顔」を描画
          const textAlign = offscreenCtx.textAlign;
          const textBaseline = offscreenCtx.textBaseline;
          offscreenCtx.fillStyle = '#fff';
          offscreenCtx.textAlign = 'center';
          offscreenCtx.textBaseline = 'middle';
          offscreenCtx.font = `${(radiusX + radiusY) * 0.2}px sans-serif`;
          offscreenCtx.fillText(t('face'), 0, 0);
          offscreenCtx.textAlign = textAlign;
          offscreenCtx.textBaseline = textBaseline;

          offscreenCtx.restore();
        } else if (currentPrivacyMode === 'mosaic') {
          // モザイクモード
          // 顔全体の境界ボックスを計算
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const landmark of landmarks) {
            const lx = landmark.x * width;
            const ly = landmark.y * height;
            minX = Math.min(minX, lx);
            minY = Math.min(minY, ly);
            maxX = Math.max(maxX, lx);
            maxY = Math.max(maxY, ly);
          }

          // 余白を追加
          const padding = (maxX - minX) * FACE_PADDING_COEFFICIENT;
          minX = Math.max(0, minX - padding);
          minY = Math.max(0, minY - padding);
          maxX = Math.min(width, maxX + padding);
          maxY = Math.min(height, maxY + padding);

          const faceWidth = maxX - minX;
          const faceHeight = maxY - minY;

          // モザイクのブロックサイズ
          const blockSize = Math.max(4, Math.floor(faceWidth * 0.08));

          // 一時キャンバスを作成または再利用
          if (!tempBlurCanvas ||
              tempBlurCanvas.width < faceWidth ||
              tempBlurCanvas.height < faceHeight) {
            tempBlurCanvas = document.createElement('canvas');
            tempBlurCanvas.width = Math.ceil(Math.max(faceWidth, 100));
            tempBlurCanvas.height = Math.ceil(Math.max(faceHeight, 100));
          }
          const tempCtx = tempBlurCanvas.getContext('2d');

          if (tempCtx) {
            // スムージングを無効化
            tempCtx.imageSmoothingEnabled = false;

            // 顔領域をコピー
            tempCtx.clearRect(0, 0, tempBlurCanvas.width, tempBlurCanvas.height);
            tempCtx.drawImage(offscreenCanvas, minX, minY, faceWidth, faceHeight, 0, 0, faceWidth, faceHeight);

            // 低解像度にスケールダウン
            const smallWidth = Math.max(1, Math.floor(faceWidth / blockSize));
            const smallHeight = Math.max(1, Math.floor(faceHeight / blockSize));
            tempCtx.drawImage(tempBlurCanvas, 0, 0, faceWidth, faceHeight, 0, 0, smallWidth, smallHeight);

            // 元のサイズにスケールアップ（モザイク効果）
            offscreenCtx.imageSmoothingEnabled = false;
            offscreenCtx.drawImage(tempBlurCanvas, 0, 0, smallWidth, smallHeight, minX, minY, faceWidth, faceHeight);
            offscreenCtx.imageSmoothingEnabled = true; // デフォルトに戻す
          }
        }
      }
    }

    if (SHOW_CURRENT_TIME) { // ちょっと日時を描画してみるか？
      let text = getLocalDateTimeString();
      offscreenCtx.font = `${minxy * 0.05}px monospace, san-serif`;
      let measure = offscreenCtx.measureText(text);
      const margin = minxy * 0.015;
      let x0 = x + width - measure.width - margin, y0 = height - margin;
      offscreenCtx.strokeStyle = "#000";
      offscreenCtx.lineWidth = minxy * 0.01;
      offscreenCtx.strokeText(text, x0, y0);
      offscreenCtx.fillStyle = "#0f0";
      offscreenCtx.fillText(text, x0, y0);
    }

    // オフスクリーンキャンバスからメインキャンバスに転送
    ctx.drawImage(offscreenCanvas, 0, 0);
  }, []);

  // 設定をする
  const doConfig = () => {
    if (!ENABLE_CONFIG)
      return;
    setShowSettings(true);
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
    <>
      {showSettings && (
        <SettingsPage
          privacyMode={privacyMode}
          onPrivacyModeChange={handlePrivacyModeChange}
          onBack={() => setShowSettings(false)}
        />
      )}
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
        doConfig={doConfig}
        aria-label={t('camera_app')}
      />
    </>
  );
}

export default App;