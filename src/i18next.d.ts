// src/i18next.d.ts
import 'i18next';

// 基準となる言語のJSONファイルをインポート
import translation from '../public/locales/en/translation.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    // 翻訳リソースの型を定義
    resources: {
      translation: typeof translation;
    };
    // 戻り値の型を厳密にする（オプション）
    // returnNull: false;
  }
}