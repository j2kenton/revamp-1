import type { NextConfig } from 'next';

const distDir = process.env.NEXT_DIST_DIR || '.next';

const nextConfig: NextConfig = {
  distDir,
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_BYPASS_AUTH:
      process.env.NEXT_PUBLIC_BYPASS_AUTH ?? process.env.BYPASS_AUTH ?? '',
    NEXT_PUBLIC_TEST_AUTH_MODE:
      process.env.NEXT_PUBLIC_TEST_AUTH_MODE ?? process.env.TEST_AUTH_MODE ?? '',
    NEXT_PUBLIC_AZURE_AD_CLIENT_ID:
      process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID ??
      process.env.AZURE_AD_CLIENT_ID ??
      '',
    NEXT_PUBLIC_AZURE_AD_TENANT_ID:
      process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID ??
      process.env.AZURE_AD_TENANT_ID ??
      '',
    NEXT_PUBLIC_REDIRECT_URI:
      process.env.NEXT_PUBLIC_REDIRECT_URI ??
      process.env.AZURE_AD_REDIRECT_URI ??
      '',
    NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI:
      process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI ??
      process.env.AZURE_AD_POST_LOGOUT_REDIRECT_URI ??
      '',
    NEXT_PUBLIC_AZURE_AD_CHAT_SCOPE:
      process.env.NEXT_PUBLIC_AZURE_AD_CHAT_SCOPE ??
      process.env.AZURE_AD_CHAT_SCOPE ??
      '',
  },
};

export default nextConfig;
