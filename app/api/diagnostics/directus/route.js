function getDirectusConfig() {
  const directusUrl = process.env.DIRECTUS_URL;
  const directusToken = process.env.DIRECTUS_TOKEN;

  if (!directusUrl || !directusToken) {
    return null;
  }

  return { directusUrl, directusToken };
}

export function GET() {
  const config = getDirectusConfig();

  if (!config) {
    return Response.json(
      {
        ok: false,
        error: 'DIRECTUS_CONFIGURATION_MISSING',
        message: 'DIRECTUS_URL and DIRECTUS_TOKEN must be configured as runtime environment variables.',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  return Response.json(
    {
      ok: true,
      configured: true,
      directusUrl: config.directusUrl,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
