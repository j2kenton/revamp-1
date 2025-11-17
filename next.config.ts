import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_BYPASS_AUTH:
      process.env.NEXT_PUBLIC_BYPASS_AUTH ?? process.env.BYPASS_AUTH ?? '',
    NEXT_PUBLIC_TEST_AUTH_MODE:
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE ?? process.env.TEST_AUTH_MODE ?? '',
  },
};

export default nextConfig;
