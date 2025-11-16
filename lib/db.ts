/**
 * Minimal Prisma client placeholder for tests.
 * The actual implementation is mocked in unit tests.
 */

export interface PrismaClientLike {
  chat: Record<string, unknown>;
  message: Record<string, unknown>;
}

export const prisma: PrismaClientLike = {
  chat: {},
  message: {},
};
