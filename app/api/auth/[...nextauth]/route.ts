import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { NextAuthOptions } from 'next-auth';

const nextAuthSecret = process.env.NEXTAUTH_SECRET;

if (!nextAuthSecret && process.env.NODE_ENV === 'production') {
  throw new Error(
    'NEXTAUTH_SECRET environment variable must be set in production.',
  );
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
        // TODO: Replace this with your actual authentication logic
        // This is just a placeholder - connect to your database/API here

        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Example: Check against your database
        // const user = await db.user.findUnique({ where: { email: credentials.email } });
        // const isValid = await bcrypt.compare(credentials.password, user.password);

        // Example to demonstrate functionality only.
        // REPLACE THIS!
        if (
          credentials.email === 'demo@example.com' &&
          credentials.password === 'password'
        ) {
          return {
            id: '1',
            email: credentials.email,
            name: 'Demo User',
          };
        }

        // Return null if user data could not be retrieved
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
