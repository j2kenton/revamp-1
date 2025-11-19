/**
 * Chat Input Component
 * Message input with validation, keyboard shortcuts, and character counter
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import Editor, { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { LoadingSpinner } from '@/components/ui/icons';
import {
  MAX_MESSAGE_LENGTH,
  CHAR_COUNT_DEBOUNCE_MS,
  SEND_DEBOUNCE_MS,
  MESSAGE_LENGTH_WARNING_THRESHOLD,
} from '@/lib/constants/ui';
import { STRINGS } from '@/lib/constants/strings';
import { useTheme } from '@/lib/theme/ThemeProvider';

const COUNTDOWN_INTERVAL_MS = 1000;

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  isStreaming: boolean;
  error?: Error | null;
  rateLimitSeconds?: number | null;
}

export function ChatInput({
  onSendMessage,
  isStreaming,
  error,
  rateLimitSeconds,
}: ChatInputProps) {
  const { actualTheme } = useTheme();
  const [message, setMessage] = useState('');
  const [isComposing, _setIsComposing] = useState(false);
  const [debouncedLength, setDebouncedLength] = useState(0);
  const [isDebounced, setIsDebounced] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [editorHeight, setEditorHeight] = useState(240); // Initial height in pixels
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const sendDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced character count update
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedLength(message.length);
    }, CHAR_COUNT_DEBOUNCE_MS);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [message]);

  // Calculate editor height based on content
  const calculateEditorHeight = () => {
    if (!editorRef.current) return 240;
    const lineCount = editorRef.current.getModel()?.getLineCount() || 1;
    const lineHeight = 20; // Monaco's default line height
    const padding = 16; // Top and bottom padding
    const minHeight = 240; // Minimum height (10 rows equivalent)
    const maxHeight = 600; // Maximum height
    return Math.min(
      Math.max(lineCount * lineHeight + padding, minHeight),
      maxHeight
    );
  };

  useEffect(() => {
    return () => {
      if (sendDebounceRef.current) {
        clearTimeout(sendDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const nextCountdown =
      typeof rateLimitSeconds === 'number' ? rateLimitSeconds : null;

    let frameId: number | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    if (typeof window === 'undefined') {
      timeoutId = setTimeout(() => setCountdown(nextCountdown), 0);
    } else {
      frameId = window.requestAnimationFrame(() => {
        setCountdown(nextCountdown);
      });
    }

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [rateLimitSeconds]);

  useEffect(() => {
    if (countdown === null) {
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => {
        if (prev === null) {
          return null;
        }
        if (prev <= 1) {
          return null;
        }
        return prev - 1;
      });
    }, COUNTDOWN_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (!trimmed || isStreaming || isDebounced || countdown !== null) {
      return;
    }

    setIsDebounced(true);
    sendDebounceRef.current = setTimeout(() => {
      setIsDebounced(false);
    }, SEND_DEBOUNCE_MS);

    onSendMessage(trimmed);
    setMessage('');
    // Reset editor height after sending
    if (editorRef.current) {
      const height = calculateEditorHeight();
      setEditorHeight(height);
    }
  };

  // Monaco Editor mount handler
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Add custom keybinding for Enter to send (without Shift)
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        handleSubmit();
      }
    );

    // Override default Enter behavior
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.onKeyDown((e: any) => {
      if (e.keyCode === monaco.KeyCode.Enter && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (!isComposing) {
          handleSubmit();
        }
      }
    });

    // Handle content changes for auto-resize
    editor.onDidChangeModelContent(() => {
      const newHeight = calculateEditorHeight();
      setEditorHeight(newHeight);
    });

    // Focus the editor on mount
    editor.focus();
  };

  // Handle editor value changes
  const handleEditorChange = (value: string | undefined) => {
    setMessage(value || '');
  };

  const isNearLimit =
    message.length > MAX_MESSAGE_LENGTH * MESSAGE_LENGTH_WARNING_THRESHOLD;
  const isOverLimit = message.length > MAX_MESSAGE_LENGTH;
  const canSubmit =
    message.trim().length > 0 &&
    !isOverLimit &&
    !isStreaming &&
    !isDebounced &&
    countdown === null;
  const errorMessage = error?.message || STRINGS.errors.sendFailed;

  return (
    <div className="p-4">
      {error && (
        <div
          className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800"
          role="alert"
          aria-live="assertive"
        >
          {errorMessage}
        </div>
      )}
      {countdown !== null && (
        <div
          className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800"
          role="status"
          aria-live="polite"
        >
          {STRINGS.errors.rateLimitCountdown(countdown)}
        </div>
      )}

      <div
        className="flex items-end gap-3"
        style={{
          flexDirection: 'column',
        }}
      >
        <div className="flex w-full gap-3">
          <div className="flex-1">
            <div
              className={clsx(
                'overflow-hidden rounded-lg border',
                {
                  'border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500':
                    !isOverLimit,
                  'border-red-300 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500':
                    isOverLimit,
                  'cursor-not-allowed opacity-50':
                    isStreaming || countdown !== null,
                },
              )}
              style={{ height: `${editorHeight}px` }}
              role="textbox"
              aria-label={STRINGS.input.ariaLabel}
              aria-invalid={isOverLimit}
              aria-describedby="char-counter"
            >
              <Editor
                height="100%"
                defaultLanguage="plaintext"
                value={message}
                onChange={handleEditorChange}
                onMount={handleEditorDidMount}
                loading={<div className="flex h-full items-center justify-center">Loading editor...</div>}
                options={{
                  minimap: { enabled: false },
                  lineNumbers: 'off',
                  glyphMargin: false,
                  folding: false,
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 0,
                  renderLineHighlight: 'none',
                  scrollBeyondLastLine: false,
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  overviewRulerBorder: false,
                  scrollbar: {
                    vertical: 'auto',
                    horizontal: 'hidden',
                    verticalScrollbarSize: 8,
                  },
                  wordWrap: 'on',
                  wrappingStrategy: 'advanced',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  padding: { top: 12, bottom: 12 },
                  readOnly: isStreaming || countdown !== null,
                  domReadOnly: isStreaming || countdown !== null,
                  suggest: { showWords: false },
                  quickSuggestions: false,
                  parameterHints: { enabled: false },
                  acceptSuggestionOnEnter: 'off',
                  tabCompletion: 'off',
                  wordBasedSuggestions: 'off',
                  occurrencesHighlight: 'off',
                  renderWhitespace: 'none',
                  renderControlCharacters: false,
                  contextmenu: true,
                  mouseWheelZoom: false,
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                }}
                theme={actualTheme === 'dark' ? 'vs-dark' : 'vs'}
              />
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={clsx(
              'rounded-md px-6 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
              {
                'bg-blue-600 text-white hover:bg-blue-700': canSubmit,
                'cursor-not-allowed bg-gray-300 text-gray-500': !canSubmit,
              },
            )}
            aria-label="Send message"
            aria-disabled={!canSubmit}
          >
            {isStreaming ? (
              <div className="flex items-center gap-2">
                <LoadingSpinner className="h-4 w-4 border-white border-t-transparent" />
                <span>{STRINGS.status.streaming}</span>
              </div>
            ) : (
              STRINGS.input.sendButton
            )}
          </button>
        </div>
        <div className="mt-2 flex justify-between text-xs font-medium">
          <span
            id="char-counter"
            className={clsx({
              'text-gray-400': !isNearLimit,
              'text-orange-500': isNearLimit && !isOverLimit,
              'text-red-500': isOverLimit,
            })}
            aria-live="polite"
          >
            {STRINGS.input.characterCount(debouncedLength, MAX_MESSAGE_LENGTH)}
          </span>
        </div>
      </div>
    </div>
  );
}
