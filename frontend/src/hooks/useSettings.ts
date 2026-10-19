import { useState, useEffect } from 'react';
import type { AppSettings } from '../types/index.js';

const SETTINGS_KEY = 'radox_ai_chat_settings';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  defaultModel: 'claude-sonnet-5',
  stream: true,
  temperature: 0.7,
  systemPrompt: '',
};

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to parse saved settings', e);
    }
    return DEFAULT_SETTINGS;
  });

  // Apply theme class to document element
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else if (settings.theme === 'light') {
      root.classList.remove('dark');
    } else if (settings.theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }, [settings.theme]);

  const updateSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to persist settings', e);
      }
      return next;
    });
  };

  return {
    settings,
    updateSettings,
  };
};
