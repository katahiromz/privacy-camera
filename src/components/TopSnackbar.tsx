// TopSnackbar.tsx --- Webトップスナックバー React コンポーネント
// Author: katahiromz
// License: MIT

import React, { useEffect, useRef, useState, useCallback } from 'react';
import './TopSnackbar.css';

export interface TopSnackbarProps {
  message: string;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  onDismiss: () => void;
  durationMs?: number;
}

// TopSnackbar: 画面上部に通知を表示するコンポーネント
const TopSnackbar: React.FC<TopSnackbarProps> = ({
  message,
  actionLabel = null,
  onAction = null,
  onDismiss,
  durationMs = 3000,
}) => {
  const [visible, setVisible] = useState(false);
  const [hiding, setHiding] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // スワイプ検知用
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const hide = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setHiding(true);
    setTimeout(() => {
      setVisible(false);
      setHiding(false);
      onDismiss();
    }, 300); // CSSのtransition時間と合わせる
  }, [onDismiss]);

  // マウント時に表示アニメーション開始
  useEffect(() => {
    // 次のフレームで visible=true にしてアニメーションをトリガー
    const raf = requestAnimationFrame(() => {
      setVisible(true);
    });

    // 自動非表示タイマーを設定
    dismissTimerRef.current = setTimeout(() => {
      hide();
    }, durationMs);

    return () => {
      cancelAnimationFrame(raf);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // アクション ボタンが押されたとき
  const handleAction = useCallback(() => {
    if (onAction) onAction();
    hide();
  }, [onAction, hide]);

  // スワイプ開始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  // スワイプ終了: 上・左・右にスワイプしたら閉じる
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const diffX = touch.clientX - touchStartRef.current.x;
    const diffY = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    const threshold = 50;
    // 上方向・左右方向のスワイプで閉じる
    if (Math.abs(diffY) > threshold && diffY < 0) {
      hide(); // 上スワイプ
    } else if (Math.abs(diffX) > threshold) {
      hide(); // 左右スワイプ
    }
  }, [hide]);

  const className = [
    'top-snackbar',
    visible ? 'top-snackbar--visible' : '',
    hiding ? 'top-snackbar--hiding' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="status"
      aria-live="polite"
    >
      <span className="top-snackbar__message">{message}</span>
      {actionLabel && onAction && (
        <button className="top-snackbar__action" onClick={handleAction}>
          {actionLabel}
        </button>
      )}
      <button className="top-snackbar__close" onClick={hide} aria-label="Close">
        ✕
      </button>
    </div>
  );
};

export default TopSnackbar;
