const { execSync } = require("node:child_process");

function getAppVersion() {
  if (process.env.NODE_ENV !== "production") {
    return "dev";
  }

  try {
    const tag = execSync("git describe --tags --exact-match", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const releaseTagMatch = tag.match(/^release\/(v\d+\.\d+\.\d+)$/);

    if (releaseTagMatch?.[1]) {
      return releaseTagMatch[1];
    }
  } catch {
    // Ignore when no tag exists on this commit.
  }

  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "dev";
  }
}

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || getAppVersion();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "250mb",
    },
  },
};

module.exports = nextConfig;
