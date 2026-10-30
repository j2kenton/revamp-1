/**
 * Chat Detail Page
 * Reopens an existing conversation at /chat/[chatId]
 */

import { ChatPageShell } from '../components/ChatPageShell';

interface ChatDetailPageProps {
  params: Promise<{ chatId: string }>;
}

export default async function ChatDetailPage({ params }: ChatDetailPageProps) {
  const { chatId } = await params;
  return <ChatPageShell initialChatId={chatId} />;
}
