import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  TEST_AUTH_COOKIE_NAME,
  TEST_AUTH_COOKIE_VALUE,
} from '@/lib/constants/test-auth';

const TEST_AUTH_ENV_FLAG = 'TEST_AUTH_MODE';
const COOKIE_MAX_AGE_SECONDS = 60 * 60; // 1 hour, renewed on each login

function isTestAuthEnabled(): boolean {
  return process.env[TEST_AUTH_ENV_FLAG] === 'true';
}

function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'test_auth_disabled',
        message: 'Test authentication mode is disabled.',
      },
    },
    { status: 404 },
  );
}

export async function POST(_request: NextRequest): Promise<Response> {
  if (!isTestAuthEnabled()) {
    return unauthorizedResponse();
  }

  const response = NextResponse.json({
    data: {
      message: 'Test authentication enabled',
    },
  });

  response.cookies.set(TEST_AUTH_COOKIE_NAME, TEST_AUTH_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}

export async function DELETE(): Promise<Response> {
  if (!isTestAuthEnabled()) {
    return unauthorizedResponse();
  }

  const response = NextResponse.json({
    data: {
      message: 'Test authentication disabled',
    },
  });

  response.cookies.set(TEST_AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
}
