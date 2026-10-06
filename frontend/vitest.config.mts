import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.tsx"],
    // West of UTC, so a date that is parsed or formatted as UTC lands on the wrong day.
    env: { TZ: "America/Los_Angeles" },
  },
});
