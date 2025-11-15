# Chat Interaction Flow Diagram - User to AI Communication

Based on the AI-Powered Chat Application architecture, this sequence diagram illustrates the complete flow when a user sends a message to the AI and receives a response in the UI.

## User Chat Interaction Sequence

```mermaid
sequenceDiagram
    participant User as User (Browser UI)
    participant ChatInput as Chat Input Component
    participant Redux as Redux Store
    participant TanStack as TanStack Query
    participant API as Next.js API Route
    participant Session as Session Validator
    participant RateLimit as Rate Limiter
    participant LLM as AI LLM Service
    participant UI as UI Components
    
    User->>ChatInput: Types message & clicks send
    
    ChatInput->>ChatInput: Client validation (zod)
    alt Validation fails
        ChatInput-->>User: Show inline error<br/>"Message too long" etc
    end
    
    ChatInput->>ChatInput: Check character limit (2000)
    alt Over limit
        ChatInput-->>User: Disable send button<br/>Show count in red
    end
    
    Note over ChatInput: Generate temp message ID
    
    ChatInput->>Redux: Dispatch ADD_OPTIMISTIC
    Redux->>Redux: Add to optimisticUpdates Map
    Redux-->>UI: Update immediately
    UI-->>User: Show message with<br/>"sending" status
    
    ChatInput->>TanStack: useSendMessage.mutate()
    
    TanStack->>TanStack: Read CSRF token from session store
    Note over TanStack: Token issued during auth handshake
    TanStack->>API: POST /api/chat<br/>Body: {chatId, message}<br/>Headers: {X-CSRF-Token}
    Note over API: Extract session cookie + CSRF header
    
    API->>Session: Validate session in Redis
    alt No valid session
        Session-->>API: 401 Unauthorized
        API-->>TanStack: ApiResponse with error
        TanStack->>Redux: Dispatch REMOVE_OPTIMISTIC
        TanStack->>Redux: Dispatch SET_ERROR
        Redux-->>UI: Remove optimistic message
        UI-->>User: Show "Please login" error
    end
    
    API->>Session: Validate CSRF token
    alt Invalid CSRF token
        Session-->>API: 401 Invalid CSRF token
        API-->>TanStack: ApiResponse with error
        TanStack->>Redux: Dispatch REMOVE_OPTIMISTIC
        TanStack->>Redux: Dispatch SET_ERROR
        Redux-->>UI: Remove optimistic message
        UI-->>User: Show "Security check failed. Refresh and retry."
    end
    
    API->>RateLimit: Check rate limit<br/>(10 req/min per user)
    alt Rate limit exceeded
        RateLimit-->>API: Limit exceeded
        API-->>TanStack: 429 Too Many Requests
        TanStack->>Redux: Dispatch REMOVE_OPTIMISTIC
        Redux-->>UI: Show message as "failed"
        UI-->>User: "Too many requests.<br/>Try again in X seconds"
    end
    
    API->>API: Validate with chatMessageSchema
    alt Invalid format
        API-->>TanStack: 400 Bad Request
        TanStack->>Redux: Dispatch REMOVE_OPTIMISTIC
        Redux-->>UI: Remove optimistic message
        UI-->>User: Show validation error
    end
    
    API->>API: Sanitize message (DOMPurify)
    API->>API: Add to chat history
    
    API->>LLM: Send sanitized message<br/>with conversation context
    Note over LLM: Process with timeout (30s)
    
    alt LLM timeout
        LLM-->>API: Timeout error
        API-->>TanStack: 500 Service timeout
        TanStack->>Redux: Update message status
        Redux-->>UI: Show as "error" status
        UI-->>User: Message failed with retry option
    end
    
    LLM-->>API: AI response with metadata
    
    API->>API: Create response Message object
    Note over API: Add metadata (model, tokens, time)
    
    API->>API: Update chat in database
    API-->>TanStack: 200 OK<br/>ApiResponse<Message>
    
    TanStack->>TanStack: Invalidate chat query
    TanStack->>Redux: Dispatch REMOVE_OPTIMISTIC
    TanStack->>Redux: Dispatch ADD_MESSAGE (both messages)
    
    Redux->>Redux: Update chats array
    Redux->>Redux: Clear optimistic update
    Redux-->>UI: Trigger re-render
    
    UI->>UI: MessageList maps messages
    UI->>UI: Update message status to "sent"
    UI->>UI: Display AI response
    UI->>UI: Update CharacterCounter
    UI-->>User: Show both messages<br/>User: ✓ sent<br/>AI: response text
    
    Note over User: Can continue conversation
    
    opt Background refetch
        TanStack->>API: GET /api/chat/[chatId]
        API-->>TanStack: Full chat history
        TanStack->>Redux: Sync if needed
    end
```

## Key UI/UX Features Illustrated

### Optimistic Updates

- **Immediate feedback**: Message appears instantly with "sending" status
- **Temp ID reconciliation**: Client-generated ID replaced with server ID
- **Rollback on failure**: Message removed or marked as failed

### Visual Status Indicators

- **sending**: Loading spinner, grayed text
- **sent**: Checkmark icon, full opacity
- **error**: Red indicator, retry button
- **typing**: Three-dot animation for AI response

### Character Counter

- **Real-time updates**: Shows remaining characters
- **Color coding**: Green → Yellow → Red as limit approaches
- **Hard limit**: Send disabled at 2000 characters

### Error Recovery

- **Inline errors**: Validation errors appear below input
- **Toast notifications**: Rate limit errors as toasts
- **Retry mechanism**: Failed messages can be resent
- **Session expiry**: Graceful redirect to login

## State Management Flow

### Redux State Updates

1. **ADD_OPTIMISTIC**: Temporary message added to Map
2. **ADD_MESSAGE**: Permanent messages added to chats array
3. **REMOVE_OPTIMISTIC**: Cleanup after server response
4. **SET_ERROR**: Global error state for UI

### TanStack Query Cache

- **Optimistic update**: Immediate UI update
- **Background refetch**: Ensures data consistency
- **Query invalidation**: After successful mutation
- **Stale-while-revalidate**: Serves cached data during fetch

## Performance Optimizations

- **Debounced validation**: 300ms delay for real-time validation
- **Message batching**: Multiple rapid sends queued
- **Virtual scrolling**: For long chat histories
- **Memoized selectors**: Redux selectors prevent unnecessary renders
- **Lazy loading**: AI response streamed in chunks (future enhancement)

## Accessibility Features

- **Screen reader announcements**:
  - "Message sent successfully"
  - "AI is typing a response"
  - "New message received"
- **Keyboard shortcuts**:
  - Enter to send (Shift+Enter for newline)
  - Escape to cancel editing
- **Focus management**:
  - Focus returns to input after send
  - New messages don't steal focus
- **aria-live regions**: Dynamic updates announced

## Error Scenarios Handled

1. **Network failure**: Offline detection, retry queue
2. **Session timeout**: Automatic re-authentication prompt
3. **Rate limiting**: Clear countdown timer
4. **Validation errors**: Specific field-level messages
5. **LLM service down**: Fallback error message
6. **Message too long**: Truncation warning
7. **Concurrent edits**: Optimistic locking

## Security Measures

- **XSS prevention**: All messages sanitized with DOMPurify
- **CSRF tokens**: `X-CSRF-Token` header required and validated before rate limiting
- **Rate limiting**: Per-user limits enforced
- **Session validation**: Every request checks Redis
- **Input validation**: Zod schemas on client and server
- **UUID validation**: Prevents ID injection attacks

## Monitoring Points

- Message send success/failure rate
- Average response time from LLM
- Rate limit hit frequency
- Client-side validation vs server-side rejection ratio
- Optimistic update rollback frequency
- Character limit violations
