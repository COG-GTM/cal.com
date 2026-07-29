const { execFileSync, execSync } = require("node:child_process");
const { existsSync } = require("node:fs");

const CLIENT_FILES_PATH = ".next/static/chunks";
// Fixed, non user-writable locations, so the binary is never resolved through PATH
const GIT_BINARIES = ["/usr/bin/git", "/usr/local/bin/git", "/bin/git"];

const getReleaseSha = () => {
  const gitBinary = GIT_BINARIES.find((binary) => existsSync(binary));
  if (!gitBinary) {
    throw new Error(`git executable not found in any of: ${GIT_BINARIES.join(", ")}`);
  }
  return execFileSync(gitBinary, ["rev-parse", "HEAD"]).toString().trim();
};

try {
  // Continue if required any env vars are not set
  const requiredEnvVars = ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"];
  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
  if (missingEnvVars.length > 0) {
    console.log(
      `Skipping release creation as required environment variables are not set: ${missingEnvVars.join(", ")}`
    );
    process.exit(0);
  }

  const release = getReleaseSha();

  // Add release
  execSync(`sentry-cli releases new ${release}`, { stdio: "inherit" });

  // Add git commits
  execSync(`sentry-cli releases set-commits ${release} --auto --ignore-missing`, {
    stdio: "inherit",
  });

  // Inject Debug IDs
  execSync(`sentry-cli sourcemaps inject ${CLIENT_FILES_PATH}`, { stdio: "inherit" });

  // Upload with release flag
  execSync(
    `sentry-cli sourcemaps upload ${CLIENT_FILES_PATH} --validate --ext=js --ext=map --release=${release}`,
    {
      stdio: "inherit",
      env: process.env,
    }
  );

  // Finalize the release
  execSync(`sentry-cli releases finalize ${release}`, { stdio: "inherit" });
} catch (err) {
  console.error("Sentry cli execution failed:", err);
  process.exit(1);
}
