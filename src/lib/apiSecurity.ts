import { NextRequest, NextResponse } from 'next/server'

/**
 * Local-only build: skip all referrer/security checks so the app can run
 * without a parent portal. We simply execute the wrapped handler.
 */
export function withReferrerCheck(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async function(request: NextRequest): Promise<NextResponse> {
    return handler(request)
  }
}

/**
 * Local-only build: every request is considered valid.
 */
export function isValidReferrer(_request: NextRequest): boolean {
    return true
}
