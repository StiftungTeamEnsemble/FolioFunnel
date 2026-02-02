/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "250mb",
    },
  },
};

module.exports = nextConfig;
