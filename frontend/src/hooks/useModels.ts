import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api.js';
import type { Model } from '../types/index.js';

const SELECTED_MODEL_KEY = 'radox_ai_selected_model';

export const useModels = (defaultModelId = 'claude-sonnet-5') => {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelIdState] = useState<string>(() => {
    return localStorage.getItem(SELECTED_MODEL_KEY) || defaultModelId;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetched = await apiService.getModels();
      setModels(fetched);

      // If no model currently selected, or current selection isn't in list, pick first Claude model or first model
      if (fetched.length > 0) {
        setSelectedModelIdState((prev) => {
          const exists = fetched.some((m) => m.id === prev);
          if (!exists) {
            const claudeModel = fetched.find((m) => m.isClaude);
            const fallbackId = claudeModel ? claudeModel.id : fetched[0].id;
            localStorage.setItem(SELECTED_MODEL_KEY, fallbackId);
            return fallbackId;
          }
          return prev;
        });
      }
    } catch (err: any) {
      console.error('Failed to load models from backend', err);
      setError(err?.message || 'Unable to connect to model service');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const selectModel = useCallback((modelId: string) => {
    setSelectedModelIdState(modelId);
    try {
      localStorage.setItem(SELECTED_MODEL_KEY, modelId);
    } catch (e) {
      console.warn('Failed to save selected model to localStorage', e);
    }
  }, []);

  const selectedModel = models.find((m) => m.id === selectedModelId) || null;

  return {
    models,
    selectedModelId,
    selectedModel,
    isLoading,
    error,
    refreshModels: fetchModels,
    selectModel,
  };
};
