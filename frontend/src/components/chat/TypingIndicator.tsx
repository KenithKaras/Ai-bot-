import React from 'react';

export const TypingIndicator: React.FC = () => {
  return (
    <div className="flex items-center space-x-1.5 py-1 px-1">
      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]" />
      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]" />
      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" />
    </div>
  );
};
