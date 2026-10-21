import type { NextConfig } from 'next';
const config: NextConfig = { serverExternalPackages: ['playwright'], experimental: { cpus: 2 } };
export default config;
