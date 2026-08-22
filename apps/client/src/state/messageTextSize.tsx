import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type PropsWithChildren } from 'react';

const STORAGE_KEY = 'chatink.message-text-size';
const sizes = ['small', 'medium', 'large'] as const;

export type MessageTextSize = typeof sizes[number];

type MessageTextSizeContextValue = {
  messageTextSize: MessageTextSize;
  setMessageTextSize: (size: MessageTextSize) => void;
};

const MessageTextSizeContext = createContext<MessageTextSizeContextValue | undefined>(undefined);

function readMessageTextSize(): MessageTextSize {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return sizes.includes(value as MessageTextSize) ? value as MessageTextSize : 'medium';
  } catch {
    return 'medium';
  }
}

function applyMessageTextSize(size: MessageTextSize): void {
  document.documentElement.dataset.messageTextSize = size;
  try {
    localStorage.setItem(STORAGE_KEY, size);
  } catch {
    // La preferencia es estética; la aplicación funciona aunque no se pueda guardar.
  }
}

export function MessageTextSizeProvider({ children }: PropsWithChildren) {
  const [messageTextSize, setSize] = useState<MessageTextSize>(readMessageTextSize);

  useLayoutEffect(() => {
    applyMessageTextSize(messageTextSize);
  }, [messageTextSize]);

  const setMessageTextSize = useCallback((size: MessageTextSize) => setSize(size), []);
  const value = useMemo(() => ({ messageTextSize, setMessageTextSize }), [messageTextSize, setMessageTextSize]);
  return <MessageTextSizeContext.Provider value={value}>{children}</MessageTextSizeContext.Provider>;
}

export function useMessageTextSize(): MessageTextSizeContextValue {
  const context = useContext(MessageTextSizeContext);
  if (context === undefined) throw new Error('useMessageTextSize debe utilizarse dentro de MessageTextSizeProvider.');
  return context;
}
