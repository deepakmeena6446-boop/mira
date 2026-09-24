import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

/** Load .env files the same way Next.js does, so scripts and the web app agree. */
export function loadProjectEnv(): void {
  const dev = process.env.NODE_ENV !== "production";
  loadEnvConfig(process.cwd(), dev, { info: () => {}, error: console.error });
}
