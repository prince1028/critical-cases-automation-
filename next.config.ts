import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // pg is a Node-only driver; keep it out of the bundle.
  serverExternalPackages: ['pg'],
  experimental: {
    // Report form with up to 6 photos (5 MB each at most; the browser normally shrinks them to ~300 KB).
    serverActions: { bodySizeLimit: '32mb' },
  },
};

export default nextConfig;
