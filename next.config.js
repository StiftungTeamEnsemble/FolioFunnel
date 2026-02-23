const rawVersion = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
// Truncate long hashes to short git hash format (7 chars)
const appVersion = rawVersion.length > 8 ? rawVersion.substring(0, 7) : rawVersion;

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "250mb",
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
  // Disable static optimization to avoid context issues during build
  generateBuildId: async () => {
    return appVersion;
  },
};

module.exports = nextConfig;
