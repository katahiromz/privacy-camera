// SettingsPage.tsx --- 設定ページ React コンポーネント
// Author: katahiromz
// License: MIT
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import './SettingsPage.css';

export type PrivacyMode = 'eyeMask' | 'faceBlur' | 'blackout' | 'mosaic';

// アプリケーションのベースパスを取得
const BASE_URL = import.meta.env.BASE_URL;

interface SettingsPageProps {
  privacyMode: PrivacyMode;
  onPrivacyModeChange: (mode: PrivacyMode) => void;
  onBack: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ privacyMode, onPrivacyModeChange, onBack }) => {
  const { t } = useTranslation();

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'eyeMask' || value === 'faceBlur' || value === 'blackout' || value === 'mosaic') {
      onPrivacyModeChange(value);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button 
          className="back-button" 
          onClick={onBack}
          aria-label={t('back')}
        >
          <ArrowLeft size={24} />
        </button>
        <h1>{t('settings_page')}</h1>
      </div>
      <div className="settings-content">
        <div className="setting-version-info">
          {t('camera_app_info')}
        </div>
        <div className="setting-version-info">
          <img src={`${BASE_URL}/pwa-120x120.png`} alt="[Logo]" />
        </div>
        <hr />
        <div className="setting-item">
          <label htmlFor="privacy-mode">{t('privacy_mode')}</label>
          <select 
            id="privacy-mode" 
            value={privacyMode}
            onChange={handleModeChange}
          >
            <option value="eyeMask">{t('eye_mask')}</option>
            <option value="faceBlur">{t('face_blur')}</option>
            <option value="blackout">{t('black_out')}</option>
            <option value="mosaic">{t('mosaic')}</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
