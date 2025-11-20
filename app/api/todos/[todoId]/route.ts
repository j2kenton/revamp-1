/**
 * Mock Todo [id] API Route
 *
 * Example API endpoint for updating and deleting individual todos
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireCsrfToken } from '@/server/middleware/csrf';
import { requireRateLimit } from '@/server/middleware/rate-limit';
import { RATE_LIMITS } from '@/lib/rate-limiter';

const SIMULATED_DELAY_MS = 300;
const STATUS_OK = 200;
const STATUS_INTERNAL_SERVER_ERROR = 500;

// Import the shared mock data (in production, use a database)
// Note: This is a simplified example; in production, use a proper data layer

// PATCH - Update a todo
async function handlePatch(
  request: NextRequest,
  context?: unknown,
): Promise<Response> {
  try {
    const body = await request.json();
    const typedContext = context as { params: Promise<{ todoId: string }> } | undefined;
    const { todoId } = await (typedContext?.params || Promise.resolve({ todoId: '' }));

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY_MS));

    // In a real app, update the database here
    // For this example, we'll just return the updated todo
    const updatedTodo = {
      id: todoId,
      ...body,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(updatedTodo);
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}

// DELETE - Delete a todo
async function handleDelete(_: NextRequest) {
  try {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY_MS));

    // In a real app, delete from database here
    // For this example, we'll just return success

    return NextResponse.json(
      { message: 'Todo deleted successfully' },
      { status: STATUS_OK },
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}

export const PATCH = requireRateLimit(
  RATE_LIMITS.API_DEFAULT,
  requireCsrfToken(handlePatch),
);

export const DELETE = requireRateLimit(
  RATE_LIMITS.API_DEFAULT,
  requireCsrfToken(handleDelete),
);
