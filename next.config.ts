import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  typedRoutes: true,
  turbopack: {
    root: __dirname,
  },
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
