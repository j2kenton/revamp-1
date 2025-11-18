import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { STRINGS } from '@/lib/constants/strings';

const originalFetch = global.fetch;
const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;

beforeAll(() => {
  global.fetch = fetchMock;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('ChatInterface integration', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends a message and renders the AI response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          aiResponse: 'Hello human',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    render(<ChatInterface />);

    const textarea = screen.getByRole('textbox', { name: STRINGS.input.ariaLabel });
    await user.type(textarea, 'Hello AI');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Hello AI')).toBeInTheDocument();
      expect(screen.getByText('Hello human')).toBeInTheDocument();
    });

    expect(textarea).toHaveValue('');
  });

  it('shows retry option when the request fails', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ aiResponse: 'Recovered' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    render(<ChatInterface />);

    const textarea = screen.getByRole('textbox', { name: STRINGS.input.ariaLabel });
    await user.type(textarea, 'Test failure');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(STRINGS.errors.sendFailed);
      expect(screen.getByRole('button', { name: STRINGS.actions.retry })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: STRINGS.actions.retry }));

    await waitFor(() => {
      expect(screen.getByText('Recovered')).toBeInTheDocument();
    });
  });

  it('prevents sending empty or whitespace-only messages', async () => {
    render(<ChatInterface />);

    const textarea = screen.getByRole('textbox', { name: STRINGS.input.ariaLabel });
    await user.type(textarea, '   ');
    await user.keyboard('{Enter}');

    expect(
      screen.getByText(STRINGS.validation.messageRequired),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
