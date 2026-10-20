import { useState, useCallback, Suspense, lazy } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './hooks/useAuth.js';
import { AuthScreen } from './components/auth/AuthScreen.js';
import { useSettings } from './hooks/useSettings.js';
import { useProviders } from './hooks/useProviders.js';
import { useModels } from './hooks/useModels.js';
import { useConversations } from './hooks/useConversations.js';
import { useChat } from './hooks/useChat.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { MobileDrawer } from './components/layout/MobileDrawer.js';
import { TopNav } from './components/layout/TopNav.js';
import { ChatArea } from './components/chat/ChatArea.js';

// Code-split heavy non-critical dialogs to minimize initial bundle size and speed up page load
const SettingsModal = lazy(() =>
  import('./components/settings/SettingsModal.js').then((m) => ({ default: m.SettingsModal }))
);
const AuthModal = lazy(() =>
  import('./components/auth/AuthModal.js').then((m) => ({ default: m.AuthModal }))
);

function ChatAppContent() {
  const { settings, updateSettings } = useSettings();
  const {
    providers,
    selectedProviderId,
    selectedProvider,
    selectProvider,
    createProvider,
    updateProvider,
    deleteProvider,
    setDefaultProvider,
  } = useProviders();

  const {
    models,
    selectedModelId,
    selectedModel,
    isLoading: isLoadingModels,
    error: modelError,
    refreshModels,
    selectModel,
  } = useModels(settings.defaultModel, selectedProviderId);

  const {
    filteredConversations,
    activeConversation,
    activeConversationId,
    setActiveConversationId,
    searchQuery,
    setSearchQuery,
    createNewConversation,
    renameConversation,
    deleteConversation,
    clearAllConversations,
    updateConversationMessages,
  } = useConversations(selectedModelId);

  const {
    isGenerating,
    sendMessage,
    stopGeneration,
    regenerateResponse,
    editAndResubmit,
  } = useChat({
    activeConversation,
    selectedModelId,
    settings,
    providerId: selectedProviderId,
    updateConversationMessages,
    createNewConversation,
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleNewConversation = useCallback(async () => {
    await createNewConversation(selectedModelId);
    setIsMobileDrawerOpen(false);
  }, [createNewConversation, selectedModelId]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      setIsMobileDrawerOpen(false);
    },
    [setActiveConversationId]
  );

  const handleClearActiveConversation = useCallback(async () => {
    if (!activeConversation) return;
    if (confirm('Are you sure you want to clear all messages in this conversation?')) {
      updateConversationMessages(activeConversation.id, []);
    }
  }, [activeConversation, updateConversationMessages]);

  const handleRetry = useCallback(() => {
    regenerateResponse();
  }, [regenerateResponse]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-surface-950 text-slate-900 dark:text-slate-100 font-sans">
      {/* Desktop Collapsible Left Sidebar */}
      <div className="hidden md:flex h-full flex-shrink-0">
        <Sidebar
          conversations={filteredConversations}
          activeConversationId={activeConversationId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onRenameConversation={renameConversation}
          onDeleteConversation={deleteConversation}
          onOpenSettings={() => setIsSettingsOpen(true)}
          settings={settings}
          onUpdateSettings={updateSettings}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
      </div>

      {/* Mobile Drawer */}
      <MobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
      >
        <Sidebar
          conversations={filteredConversations}
          activeConversationId={activeConversationId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onRenameConversation={renameConversation}
          onDeleteConversation={deleteConversation}
          onOpenSettings={() => {
            setIsMobileDrawerOpen(false);
            setIsSettingsOpen(true);
          }}
          settings={settings}
          onUpdateSettings={updateSettings}
          isCollapsed={false}
          onToggleCollapse={() => setIsMobileDrawerOpen(false)}
        />
      </MobileDrawer>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Top Navigation Bar */}
        <TopNav
          onToggleMobileDrawer={() => setIsMobileDrawerOpen(true)}
          onNewConversation={handleNewConversation}
          onClearConversation={handleClearActiveConversation}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenAuth={() => setIsAuthOpen(true)}
          activeConversation={activeConversation}
          models={models}
          selectedModelId={selectedModelId}
          selectedModel={selectedModel}
          isLoadingModels={isLoadingModels}
          modelError={modelError}
          onSelectModel={selectModel}
          onRefreshModels={refreshModels}
          selectedProvider={selectedProvider}
        />

        {/* Chat Area */}
        <ChatArea
          activeConversation={activeConversation}
          selectedModel={selectedModel}
          selectedModelId={selectedModelId}
          isGenerating={isGenerating}
          onSendMessage={sendMessage}
          onStopGeneration={stopGeneration}
          onRegenerate={() => regenerateResponse()}
          onEditAndResubmit={editAndResubmit}
          onRetry={handleRetry}
          hasProviders={providers.length > 0}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </div>

      {/* Lazy-loaded Dialogs inside Suspense */}
      <Suspense fallback={null}>
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onUpdateSettings={updateSettings}
            models={models}
            onRefreshModels={refreshModels}
            onClearAllHistory={clearAllConversations}
            onOpenAuth={() => setIsAuthOpen(true)}
            providers={providers}
            selectedProviderId={selectedProviderId}
            onSelectProvider={selectProvider}
            onCreateProvider={createProvider}
            onUpdateProvider={updateProvider}
            onDeleteProvider={deleteProvider}
            onSetDefaultProvider={setDefaultProvider}
          />
        )}

        {isAuthOpen && (
          <AuthModal
            isOpen={isAuthOpen}
            onClose={() => setIsAuthOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
}

function RootApp() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-screen bg-surface-950 flex flex-col items-center justify-center p-4 select-none">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-4 animate-pulse">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
          <span>Verifying session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return <ChatAppContent />;
}

export function App() {
  return (
    <AuthProvider>
      <RootApp />
    </AuthProvider>
  );
}

export default App;
