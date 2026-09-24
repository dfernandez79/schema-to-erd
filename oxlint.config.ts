import config from "@diegoux/oxc-config/oxlint";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [config],
  ignorePatterns: ["node_modules", "*.svg", "*.d2"],
});
