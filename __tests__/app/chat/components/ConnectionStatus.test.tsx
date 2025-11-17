import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConnectionStatus } from '@/app/chat/components/ConnectionStatus';

let mockNavigatorOnline = true;

const setNavigatorOnlineStatus = (isOnline: boolean) => {
  mockNavigatorOnline = isOnline;
};

// Mock navigator.onLine with a controllable getter
Object.defineProperty(window.navigator, 'onLine', {
  configurable: true,
  get: () => mockNavigatorOnline,
});

describe('ConnectionStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setNavigatorOnlineStatus(true);
  });

  it('shows online status when connected', () => {
    render(<ConnectionStatus />);

    expect(screen.getByText(/online/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows offline status when disconnected', () => {
    setNavigatorOnlineStatus(false);

    render(<ConnectionStatus />);

    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('updates status on online event', () => {
    setNavigatorOnlineStatus(false);
    const { rerender } = render(<ConnectionStatus />);

    expect(screen.getByText(/offline/i)).toBeInTheDocument();

    // Simulate online event
    setNavigatorOnlineStatus(true);
    window.dispatchEvent(new Event('online'));

    rerender(<ConnectionStatus />);
    expect(screen.getByText(/online/i)).toBeInTheDocument();
  });

  it('updates status on offline event', () => {
    render(<ConnectionStatus />);

    expect(screen.getByText(/online/i)).toBeInTheDocument();

    // Simulate offline event
    setNavigatorOnlineStatus(false);
    window.dispatchEvent(new Event('offline'));

    waitFor(() => {
      expect(screen.getByText(/offline/i)).toBeInTheDocument();
    });
  });

  it('shows reconnecting state during recovery', async () => {
    setNavigatorOnlineStatus(false);
    render(<ConnectionStatus />);

    // Simulate reconnection attempt
    setNavigatorOnlineStatus(true);
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
    });

    await waitFor(
      () => {
        expect(screen.getByText(/online/i)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('cleans up event listeners on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = render(<ConnectionStatus />);
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'online',
      expect.any(Function),
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'offline',
      expect.any(Function),
    );
  });
});
