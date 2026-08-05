import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { prerenderSeoPages } from './scripts/prerender-seo.mjs'

function seoPrerender() {
  return {
    name: 'seo-prerender',
    async closeBundle() {
      await prerenderSeoPages()
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), seoPrerender()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
})
