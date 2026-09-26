import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // Integration tests share one local database (`pnpm db:start`), so run files serially.
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
      DEVICE_TOKEN: "test-device-token",
    },
  },
});
