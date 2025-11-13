import { NextRequest, NextResponse } from 'next/server';

/**
 * Example API route
 * GET /api/health - Check if the API is running
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'API is running',
  });
}
