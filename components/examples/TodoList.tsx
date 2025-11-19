/**
 * Todo List Component
 *
 * Example component demonstrating CRUD operations with SWR mutations
 * Shows optimistic updates and proper error handling for mutations.
 */

'use client';

import { useState } from 'react';
import {
  useTodos,
  useCreateTodo,
  useUpdateTodo,
  useDeleteTodo,
} from '@/lib/swr/hooks';

interface TodoListProps {
  userId: string;
}

export function TodoList({ userId }: TodoListProps) {
  const [newTodoTitle, setNewTodoTitle] = useState('');

  const { data: todos, error, isLoading, mutate } = useTodos(userId);
  const { trigger: createTodo, isMutating: isCreating } = useCreateTodo();

  // Handle create new todo
  const handleCreateTodo = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newTodoTitle.trim()) return;

    try {
      await createTodo({
        title: newTodoTitle,
        completed: false,
        userId,
      });

      // Clear input
      setNewTodoTitle('');

      // Revalidate the todos list
      await mutate();
    } catch (err) {
      // TODO: Add proper error notification
      console.error('Failed to create todo:', err);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading todos">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="flex animate-pulse items-center gap-3 rounded-lg border border-gray-200 p-4"
          >
            <div className="h-5 w-5 rounded bg-gray-200" />
            <div className="h-4 flex-1 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="rounded-lg border border-red-200 bg-red-50 p-4"
        role="alert"
      >
        <h3 className="font-semibold text-red-900">Error loading todos</h3>
        <p className="text-sm text-red-700">{error.message}</p>
        <button
          onClick={() => mutate()}
          className="mt-2 cursor-pointer rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Create new todo form */}
      <form onSubmit={handleCreateTodo} className="flex gap-2">
        <input
          type="text"
          value={newTodoTitle}
          onChange={(e) => setNewTodoTitle(e.target.value)}
          placeholder="Add a new todo..."
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isCreating}
          aria-label="New todo title"
        />
        <button
          type="submit"
          disabled={isCreating || !newTodoTitle.trim()}
          className="cursor-pointer rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCreating ? 'Adding...' : 'Add'}
        </button>
      </form>

      {/* Todos list */}
      {!todos || todos.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-gray-700">No todos yet. Create one above!</p>
        </div>
      ) : (
        <ul className="space-y-2" role="list">
          {todos.map((todo) => (
            <TodoItem key={todo.id} todo={todo} onUpdate={mutate} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Individual Todo Item Component
 */
interface TodoItemProps {
  todo: { id: string; title: string; completed: boolean };
  onUpdate: () => void;
}

function TodoItem({ todo, onUpdate }: TodoItemProps) {
  const { trigger: updateTodo, isMutating: isUpdating } = useUpdateTodo(
    todo.id,
  );
  const { trigger: deleteTodo, isMutating: isDeleting } = useDeleteTodo(
    todo.id,
  );

  const handleToggle = async () => {
    try {
      await updateTodo({ completed: !todo.completed });
      await onUpdate();
    } catch (err) {
      console.error('Failed to update todo:', err);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTodo();
      await onUpdate();
    } catch (err) {
      console.error('Failed to delete todo:', err);
    }
  };

  return (
    <li className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={handleToggle}
        disabled={isUpdating || isDeleting}
        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
        aria-label={`Mark "${todo.title}" as ${todo.completed ? 'incomplete' : 'complete'}`}
      />
      <span
        className={`flex-1 ${
          todo.completed ? 'text-gray-500 line-through' : 'text-gray-900'
        }`}
      >
        {todo.title}
      </span>
      <button
        onClick={handleDelete}
        disabled={isUpdating || isDeleting}
        className="cursor-pointer rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Delete "${todo.title}"`}
      >
        {isDeleting ? 'Deleting...' : 'Delete'}
      </button>
    </li>
  );
}
