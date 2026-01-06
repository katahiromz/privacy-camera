// PermissionManager.ts --- 権限監視
// Author: katahiromz
// License: MIT

export type PermissionStatusValue = PermissionState; // 'granted' | 'denied' | 'prompt'

export class PermissionManager {
  private name: PermissionName;
  private status: PermissionStatusValue = 'prompt';
  private listeners: ((status: PermissionStatusValue) => void)[] = [];

  constructor(name: PermissionName) {
    this.name = name;
    this.init();
  }

  private async init() {
    if (typeof window === 'undefined' || !navigator.permissions) {
      console.warn('Permissions API is not supported in this environment.');
      return;
    }

    try {
      // カメラ権限の状態を取得
      const permissionStatus = await navigator.permissions.query({ name: this.name as PermissionName });

      this.status = permissionStatus.state;

      // 状態変更を監視
      permissionStatus.onchange = () => {
        this.status = permissionStatus.state;
        this.notifyListeners();
      };
    } catch (error) {
      console.error(`Failed to check ${this.name} permission:`, error);
    }
  }

  /**
   * 現在の権限状態を同期的に取得
   */
  public getStatus(): PermissionStatusValue {
    return this.status;
  }

  /**
   * 状態の変化を購読
   * @param callback 状態が変わった時に実行される関数
   * @returns 購読解除用の関数
   */
  public subscribe(callback: (status: PermissionStatusValue) => void) {
    this.listeners.push(callback);
    // 初期状態を一度通知
    callback(this.status);

    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(callback => callback(this.status));
  }
}
