import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api.js';
import { useAuth } from './useAuth.js';
import type { SafeProvider, ProviderCreateInput, ProviderUpdateInput } from '../types/index.js';

export function useProviders() {
  const { isAuthenticated, user } = useAuth();
  const [providers, setProviders] = useState<SafeProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(() => {
    return localStorage.getItem('radox_active_provider_id');
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProviders = useCallback(async () => {
    if (!isAuthenticated) {
      setProviders([]);
      setSelectedProviderId(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await apiService.getProviders();
      setProviders(data);

      // If no provider selected, select default if available
      if (!selectedProviderId && data.length > 0) {
        const defaultProv = data.find((p) => p.isDefault) || data[0];
        setSelectedProviderId(defaultProv.id);
        localStorage.setItem('radox_active_provider_id', defaultProv.id);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load providers');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, selectedProviderId]);

  useEffect(() => {
    refreshProviders();
  }, [isAuthenticated, user?.id]);

  const selectProvider = useCallback((id: string | null) => {
    setSelectedProviderId(id);
    if (id) {
      localStorage.setItem('radox_active_provider_id', id);
    } else {
      localStorage.removeItem('radox_active_provider_id');
    }
  }, []);

  const createProvider = useCallback(
    async (input: ProviderCreateInput): Promise<SafeProvider> => {
      const created = await apiService.createProvider(input);
      setProviders((prev) => [created, ...prev]);
      if (created.isDefault || providers.length === 0) {
        selectProvider(created.id);
      }
      return created;
    },
    [providers.length, selectProvider]
  );

  const updateProvider = useCallback(
    async (id: string, input: ProviderUpdateInput): Promise<SafeProvider> => {
      const updated = await apiService.updateProvider(id, input);
      setProviders((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return updated;
    },
    []
  );

  const deleteProvider = useCallback(
    async (id: string): Promise<void> => {
      await apiService.deleteProvider(id);
      setProviders((prev) => prev.filter((p) => p.id !== id));
      if (selectedProviderId === id) {
        selectProvider(null);
      }
    },
    [selectedProviderId, selectProvider]
  );

  const setDefaultProvider = useCallback(
    async (id: string): Promise<void> => {
      await apiService.setDefaultProvider(id);
      setProviders((prev) =>
        prev.map((p) => ({
          ...p,
          isDefault: p.id === id,
        }))
      );
      selectProvider(id);
    },
    [selectProvider]
  );

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) || null;

  return {
    providers,
    selectedProviderId,
    selectedProvider,
    isLoading,
    error,
    refreshProviders,
    selectProvider,
    createProvider,
    updateProvider,
    deleteProvider,
    setDefaultProvider,
  };
}
