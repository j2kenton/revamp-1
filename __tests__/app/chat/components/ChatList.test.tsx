import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatList } from '@/app/chat/components/ChatList';
import { useChatList } from '@/app/chat/hooks/useChatList';
import { STRINGS } from '@/lib/constants/strings';
import type { ChatDTO } from '@/types/models';

jest.mock('@/app/chat/hooks/useChatList', () => ({
  useChatList: jest.fn(),
}));

const mockUseChatList = useChatList as jest.MockedFunction<typeof useChatList>;

const chats: ChatDTO[] = [
  {
    id: 'chat-2',
    userId: 'user-1',
    title: 'Newer chat',
    archived: false,
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
  },
  {
    id: 'chat-1',
    userId: 'user-1',
    title: 'Older chat',
    archived: false,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
  },
];

const listState = (overrides: Partial<ReturnType<typeof useChatList>>) => ({
  chats: [],
  isLoading: false,
  error: null,
  refetch: jest.fn(),
  ...overrides,
});

describe('ChatList', () => {
  const onSelectChat = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a loading skeleton while fetching', () => {
    mockUseChatList.mockReturnValue(listState({ isLoading: true }));

    render(<ChatList onSelectChat={onSelectChat} />);

    expect(
      screen.getByRole('status', {
        name: STRINGS.chat.sidebar.loadingAriaLabel,
      }),
    ).toBeInTheDocument();
  });

  it('renders the empty state when there are no chats', () => {
    mockUseChatList.mockReturnValue(listState({}));

    render(<ChatList onSelectChat={onSelectChat} />);

    expect(screen.getByText(STRINGS.chat.sidebar.empty)).toBeInTheDocument();
  });

  it('renders the error state when loading fails', () => {
    mockUseChatList.mockReturnValue(
      listState({ error: new Error('Network down') }),
    );

    render(<ChatList onSelectChat={onSelectChat} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(STRINGS.chat.sidebar.errorTitle),
    ).toBeInTheDocument();
    expect(screen.getByText('Network down')).toBeInTheDocument();
  });

  it('renders one row per chat with title and marks the active row', () => {
    mockUseChatList.mockReturnValue(listState({ chats }));

    render(<ChatList activeChatId="chat-1" onSelectChat={onSelectChat} />);

    expect(screen.getByText('Newer chat')).toBeInTheDocument();
    expect(screen.getByText('Older chat')).toBeInTheDocument();

    const activeRow = screen.getByRole('button', { name: /Older chat/ });
    expect(activeRow).toHaveAttribute('aria-current', 'true');
    const inactiveRow = screen.getByRole('button', { name: /Newer chat/ });
    expect(inactiveRow).not.toHaveAttribute('aria-current');
  });

  it('invokes the selection callback with the chat id on row click', async () => {
    const user = userEvent.setup();
    mockUseChatList.mockReturnValue(listState({ chats }));

    render(<ChatList onSelectChat={onSelectChat} />);

    await user.click(screen.getByRole('button', { name: /Newer chat/ }));

    expect(onSelectChat).toHaveBeenCalledTimes(1);
    expect(onSelectChat).toHaveBeenCalledWith('chat-2');
  });
});
