/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-EndoDB-Runtime', value: 'nextjs-directus' },
        { key: 'Cache-Control', value: 'no-store' },
      ],
    }];
  },
};

export default nextConfig;
