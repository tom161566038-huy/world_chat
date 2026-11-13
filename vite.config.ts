import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  // 前端源码在 src/client，公共类型在 src/shared
})
