// 翻訳・国際化(i18n)用
// Author: katahiromz
// License: MIT

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import HttpApi from 'i18next-http-backend';

const BASE_URL = import.meta.env.BASE_URL || '/';

// サポートしている言語
export const supportedLngs = {
  ja: '日本語',
  en: 'English'
};
const languageList = ['ja', 'en'];

// HTMLの言語を変える
const UserLang = () => {
  let language = navigator.language;
  if (language.indexOf('-') != -1) language = language.split('-')[0]
  for (let key of languageList) {
    if (key == language)
      return language;
  }
  return 'en';
};
document.getElementsByTagName('html')[0].lang = UserLang();

i18n
  .use(HttpApi) // 翻訳ファイルを非同期に読み込むため
  .use(LanguageDetector) // ユーザーの言語設定を検知するため
  .use(initReactI18next) // i18next インスタンスを初期化
  .init({
    returnEmptyString: true, // 空文字での定義を許可に
    supportedLngs: languageList,
    debug: true,
    load: 'languageOnly',
    fallbackLng: 'en',

    backend: {
      // 翻訳ファイルを読み込むパス
      // {{lng}} は現在の言語 ('ja')、{{ns}} は名前空間 ('translation') に置き換わる
      loadPath: BASE_URL + 'locales/{{lng}}/{{ns}}.json',
    },

    interpolation: {
      escapeValue: false, // ReactではXSS対策が組み込まれているため不要
    },
  });

i18n.on('languageChanged', (lng) => {
  console.log('現在の言語:', lng);
});

i18n.on('failedLoading', (lng, ns, msg) => {
  console.error('読み込み失敗:', lng, ns, msg);
});

export default i18n;
