/**
 * Mock Todos API Route
 *
 * Example API endpoint for testing SWR mutations
 * Supports GET (list), POST (create), PATCH (update), DELETE operations
 */

import { NextResponse } from 'next/server';

import type { Todo } from '@/lib/swr/types';

// In-memory store (in production, use a real database)
const mockTodos: Todo[] = [
  {
    id: '1',
    title: 'Learn Next.js',
    completed: true,
    userId: '1',
    createdAt: new Date('2024-01-01').toISOString(),
  },
  {
    id: '2',
    title: 'Explore SWR',
    completed: false,
    userId: '1',
    createdAt: new Date('2024-01-02').toISOString(),
  },
  {
    id: '3',
    title: 'Build a project',
    completed: false,
    userId: '1',
    createdAt: new Date('2024-01-03').toISOString(),
  },
];

// GET - List all todos or filter by user
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    let todos = mockTodos;

    if (userId) {
      todos = mockTodos.filter((todo) => todo.userId === userId);
    }

    return NextResponse.json(todos);
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// POST - Create a new todo
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.title || !body.userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    // Create new todo
    const newTodo: Todo = {
      id: String(Date.now()),
      title: body.title,
      completed: body.completed ?? false,
      userId: body.userId,
      createdAt: new Date().toISOString(),
    };

    mockTodos.push(newTodo);

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    return NextResponse.json(newTodo, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
