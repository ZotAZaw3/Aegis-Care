import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Standalone config (đã gỡ @lovable.dev/vite-tanstack-config).
// Vite tự inject import.meta.env.VITE_*; @ alias qua tsconfig paths.
export default defineConfig({
  server: { port: 8080, host: true },
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    // Redirect TanStack Start server entry to src/server.ts (SSR error wrapper).
    tanstackStart({ server: { entry: "server" } }),
    // Nitro: compile server cho deploy (Vercel tự nhận preset — không cần vercel.json).
    nitro(),
    viteReact(),
  ],
});
