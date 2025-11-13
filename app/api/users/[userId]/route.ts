/**
 * Mock Users API Route
 *
 * Example API endpoint for testing SWR hooks
 * In production, this would connect to a real database
 */

import { NextResponse } from 'next/server';

import type { User } from '@/lib/swr/types';

// Mock user data
const mockUsers: User[] = [
  {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'admin',
    avatar: 'https://ui-avatars.com/api/?name=John+Doe',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-15').toISOString(),
  },
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: 'user',
    avatar: 'https://ui-avatars.com/api/?name=Jane+Smith',
    createdAt: new Date('2024-02-01').toISOString(),
    updatedAt: new Date('2024-02-10').toISOString(),
  },
  {
    id: '3',
    name: 'Bob Johnson',
    email: 'bob@example.com',
    role: 'user',
    createdAt: new Date('2024-03-01').toISOString(),
    updatedAt: new Date('2024-03-05').toISOString(),
  },
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const { userId } = await params;
    const user = mockUsers.find((u) => u.id === userId);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
