/**
 * Manual Jest mock for `next-auth`.
 * Some modules import `getServerSession` directly while others grab the default export,
 * so we expose both shapes to mirror the real package surface.
 */
const getServerSession = jest.fn();
const nextAuthMock = { getServerSession };

// Preserve named import usage: `import { getServerSession } from 'next-auth'`
export { getServerSession };
// Preserve default import usage: `import nextAuth from 'next-auth'`
export default nextAuthMock;
