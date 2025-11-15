/**
 * Mock Todo [id] API Route
 *
 * Example API endpoint for updating and deleting individual todos
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireCsrfToken } from '@/server/middleware/csrf';
import { requireRateLimit } from '@/server/middleware/rate-limit';
import { RATE_LIMITS } from '@/lib/rate-limiter';

// Import the shared mock data (in production, use a database)
// Note: This is a simplified example; in production, use a proper data layer

// PATCH - Update a todo
async function handlePatch(
  request: NextRequest,
  { params }: { params: Promise<{ todoId: string }> },
) {
  try {
    const body = await request.json();
    const { todoId } = await params;

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

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
      { status: 500 },
    );
  }
}

// DELETE - Delete a todo
async function handleDelete(_: NextRequest) {
  try {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    // In a real app, delete from database here
    // For this example, we'll just return success

    return NextResponse.json(
      { message: 'Todo deleted successfully' },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
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
