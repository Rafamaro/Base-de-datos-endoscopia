export function GET() {
  return Response.json(
    {
      ok: true,
      service: 'endodb',
      runtime: 'nextjs',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
