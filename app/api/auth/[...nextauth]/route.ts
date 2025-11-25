import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { NextAuthOptions } from 'next-auth';

const nextAuthSecret = process.env.NEXTAUTH_SECRET;

// SECURITY: Require NEXTAUTH_SECRET in ALL environments (HIGH-04)
if (!nextAuthSecret) {
  throw new Error('NEXTAUTH_SECRET environment variable must be set.');
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: {
          label: 'Email',
          type: 'email',
          placeholder: 'you@example.com',
        },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // SECURITY (CRIT-01): Demo credentials have been removed.
        // TODO: Implement your actual authentication logic here.
        // Connect to your database/API to validate credentials.
        //
        // Example implementation:
        // const user = await db.user.findUnique({ where: { email: credentials.email } });
        // if (!user) return null;
        // const isValid = await bcrypt.compare(credentials.password, user.password);
        // if (!isValid) return null;
        // return { id: user.id, email: user.email, name: user.name };

        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // No demo credentials - authentication must be implemented
        // Return null until real auth is configured
        return null;
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (
        token &&
        session.user &&
        typeof token.id === 'string' &&
        typeof token.email === 'string' &&
        typeof token.name === 'string'
      ) {
        session.user.id = token.id;
        session.user.email = token.email;
        session.user.name = token.name;
      }
      return session;
    },
  },
  secret: nextAuthSecret,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
