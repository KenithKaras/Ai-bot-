import React from 'react';
import { X } from 'lucide-react';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer content */}
      <div className="relative w-72 max-w-[85vw] h-full bg-white dark:bg-surface-900 shadow-2xl z-10 flex flex-col">
        {/* Close Button Header */}
        <div className="absolute top-3 right-3 z-20">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-surface-850 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            title="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 h-full overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
};
