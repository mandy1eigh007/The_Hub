import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local dev with working /api routes: `npm run pages:dev`
// (wrangler pages dev serves dist + functions together).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
