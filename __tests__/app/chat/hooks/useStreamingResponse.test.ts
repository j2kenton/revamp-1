import { renderHook, act, waitFor } from '@testing-library/react';
import { useStreamingResponse } from '@/app/chat/hooks/useStreamingResponse';

describe('useStreamingResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processes streaming responses', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"token": "Hello"}\n\n'),
        );
        controller.enqueue(
          new TextEncoder().encode('data: {"token": " world"}\n\n'),
        );
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      body: mockStream,
    });

    const { result } = renderHook(() => useStreamingResponse());

    act(() => {
      result.current.startStream('Test message');
    });

    expect(result.current.isStreaming).toBe(true);

    await waitFor(() => {
      expect(result.current.streamedContent).toBe('Hello world');
      expect(result.current.isStreaming).toBe(false);
    });
  });

  it('handles stream errors', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"error": "Stream failed"}\n\n'),
        );
        controller.close();
      },
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      body: mockStream,
    });

    const { result } = renderHook(() => useStreamingResponse());

    act(() => {
      result.current.startStream('Test');
    });

    await waitFor(() => {
      expect(result.current.error).toContain('Stream failed');
      expect(result.current.isStreaming).toBe(false);
    });
  });

  it('cancels stream on abort', async () => {
    const abortController = new AbortController();
    const mockStream = new ReadableStream({
      start(controller) {
        // Simulate slow stream
        setTimeout(() => {
          controller.enqueue(
            new TextEncoder().encode('data: {"token": "Test"}\n\n'),
          );
        }, 100);
      },
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      body: mockStream,
    });

    const { result } = renderHook(() => useStreamingResponse());

    act(() => {
      result.current.startStream('Test', { signal: abortController.signal });
    });

    act(() => {
      result.current.cancelStream();
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamedContent).toBe('');
  });

  it('handles reconnection on stream interruption', async () => {
    let attemptCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount === 1) {
        // First attempt fails
        return Promise.reject(new Error('Connection lost'));
      }
      // Second attempt succeeds
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"token": "Reconnected"}\n\n'),
          );
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return Promise.resolve({ ok: true, body: mockStream });
    });

    const { result } = renderHook(() => useStreamingResponse());

    act(() => {
      result.current.startStream('Test', { retry: true });
    });

    await waitFor(() => {
      expect(result.current.streamedContent).toBe('Reconnected');
    });

    expect(attemptCount).toBe(2);
  });

  it('accumulates tokens correctly', async () => {
    const tokens = ['The', ' quick', ' brown', ' fox'];
    let index = 0;

    const mockStream = new ReadableStream({
      start(controller) {
        const interval = setInterval(() => {
          if (index < tokens.length) {
            controller.enqueue(
              new TextEncoder().encode(
                `data: {"token": "${tokens[index]}"}\n\n`,
              ),
            );
            index++;
          } else {
            clearInterval(interval);
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          }
        }, 10);
      },
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      body: mockStream,
    });

    const { result } = renderHook(() => useStreamingResponse());

    act(() => {
      result.current.startStream('Generate text');
    });

    await waitFor(() => {
      expect(result.current.streamedContent).toBe('The quick brown fox');
      expect(result.current.isStreaming).toBe(false);
    });
  });

  it('handles empty stream', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      body: mockStream,
    });

    const { result } = renderHook(() => useStreamingResponse());

    act(() => {
      result.current.startStream('Test');
    });

    await waitFor(() => {
      expect(result.current.streamedContent).toBe('');
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });
});
