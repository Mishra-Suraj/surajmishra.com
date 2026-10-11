import { ViteImageOptimizer } from "vite-plugin-image-optimizer";
import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: { options: { typeAware: true, typeCheck: true } },
  plugins: [ViteImageOptimizer({ test: /\.(jpe?g|png|gif|tiff|webp|avif)$/i })],
});
