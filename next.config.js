const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

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
