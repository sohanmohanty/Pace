import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["evals/**/*.eval.test.ts"],
    reporters: ["verbose"],
    testTimeout: 120_000
  }
});
