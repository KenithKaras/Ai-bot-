import { useState, useCallback } from 'react';
import { useSettings } from './hooks/useSettings.js';
import { useModels } from './hooks/useModels.js';
import { useConversations } from './hooks/useConversations.js';
import { useChat } from './hooks/useChat.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { MobileDrawer } from './components/layout/MobileDrawer.js';
import { TopNav } from './components/layout/TopNav.js';
import { ChatArea } from './components/chat/ChatArea.js';
import { SettingsModal } from './components/settings/SettingsModal.js';

export function App() {
  const { settings, updateSettings } = useSettings();
  const {
    models,
    selectedModelId,
    selectedModel,
    isLoading: isLoadingModels,
    error: modelError,
    refreshModels,
    selectModel,
  } = useModels(settings.defaultModel);

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
    updateConversationMessages,
    createNewConversation,
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
          activeConversation={activeConversation}
          models={models}
          selectedModelId={selectedModelId}
          selectedModel={selectedModel}
          isLoadingModels={isLoadingModels}
          modelError={modelError}
          onSelectModel={selectModel}
          onRefreshModels={refreshModels}
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
        />
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
        models={models}
        onRefreshModels={refreshModels}
        onClearAllHistory={clearAllConversations}
      />
    </div>
  );
}

export default App;
