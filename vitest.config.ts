import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 20000,
    deps: {
      external: [/^node:/],
    },
    env: {
      NODE_ENV: "test",
      SESSION_SECRET: "test-secret-not-for-production",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "test-pass-123",
    },
  },
});
