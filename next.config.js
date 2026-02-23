const { execSync } = require("node:child_process");

function getAppVersion() {
  console.log("[version] Resolving app version...");
  console.log(`[version] NODE_ENV = ${process.env.NODE_ENV}`);
  console.log(
    `[version] NEXT_PUBLIC_APP_VERSION env = ${process.env.NEXT_PUBLIC_APP_VERSION || "(not set)"}`,
  );

  // If explicitly provided (e.g. via Docker build arg), use it directly
  if (process.env.NEXT_PUBLIC_APP_VERSION) {
    console.log(
      `[version] Using NEXT_PUBLIC_APP_VERSION from env: ${process.env.NEXT_PUBLIC_APP_VERSION}`,
    );
    return process.env.NEXT_PUBLIC_APP_VERSION;
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[version] Non-production environment, returning 'dev'");
    return "dev";
  }

  // Check if .git directory exists
  const fs = require("node:fs");
  const gitExists = fs.existsSync(".git");
  console.log(`[version] .git directory exists: ${gitExists}`);

  if (!gitExists) {
    console.warn(
      "[version] No .git directory found. " +
        "Set NEXT_PUBLIC_APP_VERSION as a Docker build arg to pass the version.",
    );
    return "dev";
  }

  // Log shallow clone info (Coolify may do shallow clones without tags)
  const isShallow = fs.existsSync(".git/shallow");
  console.log(`[version] Shallow clone: ${isShallow}`);

  try {
    const tag = execSync("git describe --tags --exact-match", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    console.log(`[version] git tag found: ${tag}`);
    const releaseTagMatch = tag.match(/^release\/(v\d+\.\d+\.\d+)$/);

    if (releaseTagMatch?.[1]) {
      console.log(`[version] Resolved from release tag: ${releaseTagMatch[1]}`);
      return releaseTagMatch[1];
    }
    console.log(`[version] Tag '${tag}' does not match release/vX.X.X pattern`);
  } catch (e) {
    console.log(
      `[version] No exact git tag on current commit: ${e.message || e}`,
    );
  }

  try {
    const hash = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    console.log(`[version] Resolved from git hash: ${hash}`);
    return hash;
  } catch (e) {
    console.warn(`[version] git rev-parse failed: ${e.message || e}`);
    return "dev";
  }
}

const appVersion = getAppVersion();
console.log(`[version] Final app version: ${appVersion}`);

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
