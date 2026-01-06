// SettingsPage.tsx --- 設定ページ React コンポーネント
// Author: katahiromz
// License: MIT
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import './SettingsPage.css';

export type PrivacyMode = 'eyeMask' | 'faceBlur';

interface SettingsPageProps {
  privacyMode: PrivacyMode;
  onPrivacyModeChange: (mode: PrivacyMode) => void;
  onBack: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ privacyMode, onPrivacyModeChange, onBack }) => {
  const { t } = useTranslation();

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'eyeMask' || value === 'faceBlur') {
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
        <div className="setting-item">
          <label htmlFor="privacy-mode">{t('privacy_mode')}</label>
          <select 
            id="privacy-mode" 
            value={privacyMode} 
            onChange={handleModeChange}
          >
            <option value="eyeMask">{t('eye_mask')}</option>
            <option value="faceBlur">{t('face_blur')}</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
