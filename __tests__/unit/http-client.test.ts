import { fetchWithTimeout } from '@/lib/http/client';

const originalFetch = global.fetch;

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns parsed JSON payload for successful responses', async () => {
    const payload = {
      data: { id: '1' },
      meta: { requestId: 'req-123', timestamp: new Date().toISOString() },
    };

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: jest.fn().mockReturnValue('req-123'),
      },
      json: jest.fn().mockResolvedValue(payload),
    });

    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await fetchWithTimeout<typeof payload.data>('/api/example', {
      timeout: 50,
    });

    expect(result).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith('/api/example', expect.any(Object));
  });

  it('returns empty payload metadata for 204 responses', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: {
        get: jest.fn().mockReturnValue(null),
      },
      json: jest.fn(),
    });

    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await fetchWithTimeout<null>('/api/no-content');

    expect(result.data).toBeNull();
    expect(result.meta.requestId).toBe('');
    expect(mockFetch).toHaveBeenCalled();
  });

  it('returns timeout error when fetch aborts', async () => {
    const abortError = new Error('Timeout');
    abortError.name = 'AbortError';

    const mockFetch = jest.fn().mockRejectedValue(abortError);
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await fetchWithTimeout('/api/slow', { timeout: 1 });

    expect(result.error?.code).toBe('TIMEOUT');
    expect(result.data).toBeNull();
  });
});
