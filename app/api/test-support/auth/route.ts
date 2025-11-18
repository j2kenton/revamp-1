import { NextRequest, NextResponse } from 'next/server';

import {
  TEST_AUTH_COOKIE_NAME,
  TEST_AUTH_COOKIE_VALUE,
} from '@/lib/constants/test-auth';

const TEST_AUTH_ENV_FLAG = 'TEST_AUTH_MODE';
const COOKIE_MAX_AGE_SECONDS = 60 * 60;
const DEFAULT_ALLOWED_HOSTS = ['localhost', '127.0.0.1'];

const unauthorizedResponse = (message: string, status = 403): NextResponse =>
  NextResponse.json(
    {
      error: {
        code: 'test_auth_disabled',
        message,
      },
    },
    { status },
  );

const isTestAuthEnabled = (): boolean =>
  process.env[TEST_AUTH_ENV_FLAG] === 'true';

const sanitizeHost = (host: string | null): string | null => {
  if (!host) {
    return null;
  }

  return host.trim().toLowerCase().replace(/:\d+$/, '');
};

const parseRefererHost = (referer: string | null): string | null => {
  if (!referer) {
    return null;
  }

  try {
    return sanitizeHost(new URL(referer).host);
  } catch {
    return null;
  }
};

const parseAllowedHosts = (): string[] => {
  const configured = process.env.TEST_AUTH_ALLOWED_HOSTS;
  if (!configured) {
    return DEFAULT_ALLOWED_HOSTS;
  }

  return configured
    .split(',')
    .map((value) => value.trim().toLowerCase().replace(/:\d+$/, ''))
    .filter(Boolean);
};

const matchesHostRule = (host: string, allowed: string): boolean => {
  if (allowed.startsWith('*.')) {
    const suffix = allowed.slice(2);
    return suffix.length > 0
      ? host === suffix || host.endsWith(`.${suffix}`)
      : false;
  }

  if (allowed.startsWith('.')) {
    const suffix = allowed.slice(1);
    return suffix.length > 0
      ? host === suffix || host.endsWith(`.${suffix}`)
      : false;
  }

  if (allowed.endsWith('.')) {
    const prefix = allowed.slice(0, -1);
    return prefix.length > 0
      ? host === prefix || host.startsWith(`${prefix}.`)
      : false;
  }

  return host === allowed;
};

const isRequestFromAllowedHost = (request: NextRequest): boolean => {
  const allowedHosts = parseAllowedHosts();
  const host = sanitizeHost(request.headers.get('host'));
  const refererHost = parseRefererHost(request.headers.get('referer'));

  if (host && allowedHosts.some((allowed) => matchesHostRule(host, allowed))) {
    return true;
  }

  if (
    refererHost &&
    allowedHosts.some((allowed) => matchesHostRule(refererHost, allowed))
  ) {
    return true;
  }

  return false;
};

const validateRequest = (request: NextRequest): NextResponse | null => {
  if (!isTestAuthEnabled()) {
    return unauthorizedResponse('Test authentication mode is disabled.', 404);
  }

  if (process.env.NODE_ENV === 'production' && !isRequestFromAllowedHost(request)) {
    return unauthorizedResponse(
      'Test authentication is not allowed from this origin.',
    );
  }

  return null;
};

export async function POST(request: NextRequest): Promise<Response> {
  const validationError = validateRequest(request);
  if (validationError) {
    return validationError;
  }

  const response = NextResponse.json({
    data: {
      message: 'Test authentication enabled',
    },
  });

  response.cookies.set({
    name: TEST_AUTH_COOKIE_NAME,
    value: TEST_AUTH_COOKIE_VALUE,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const validationError = validateRequest(request);
  if (validationError) {
    return validationError;
  }

  const response = NextResponse.json({
    data: {
      message: 'Test authentication disabled',
    },
  });

  response.cookies.set({
    name: TEST_AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
}
