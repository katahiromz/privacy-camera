// MediaDeviceManager.ts --- メディア デバイス マネージャ
// Author: katahiromz
// License: MIT

/**
 * デバイス情報を整理するためのインターフェース
 */
export interface DeviceSummary {
  videoInputs: MediaDeviceInfo[];
  audioInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
}

/**
 * メディアデバイスを管理するクラス
 */
export class MediaDeviceManager {
  /**
   * 利用可能なすべてのメディアデバイスを取得し、種類ごとに分類して返します。
   */
  async getDevices(): Promise<DeviceSummary> {
    try {
      // デバイス一覧を取得
      const devices = await navigator.mediaDevices.enumerateDevices();

      return {
        videoInputs: devices.filter(d => d.kind === 'videoinput'),
        audioInputs: devices.filter(d => d.kind === 'audioinput'),
        audioOutputs: devices.filter(d => d.kind === 'audiooutput'),
      };
    } catch (error) {
      console.error('デバイスの取得に失敗しました:', error);
      throw error;
    }
  }

  /**
   * デバイスの背面・前面の判定
   */
  async getDeviceFacingMode(device: MediaDeviceInfo): Promise<'environment' | 'user' | 'unknown'> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: device.deviceId } }
    });
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities() as any; // 型定義の補完
    track.stop(); // 使用が終わったらすぐに停止

    // capabilities.facingMode は ['user'] や ['environment'] の配列で返る
    return capabilities.facingMode ? capabilities.facingMode[0] : 'unknown';
  }

  /**
   * デバイス名（ラベル）を取得するために、一時的に権限をリクエストします。
   * 権限がない状態だと enumerateDevices() はラベルを返しません。
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      // ストリームを取得できたら、すぐにトラックを止めてカメラをオフにする
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.warn('権限が拒否されました:', error);
      return false;
    }
  }
}
