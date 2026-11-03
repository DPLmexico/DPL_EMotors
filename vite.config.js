import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Rutas relativas: el build funciona en cualquier subcarpeta o repo de GitHub Pages.
  base: "./",
  // Permite abrir el servidor de desarrollo por MagicDNS de Tailscale (*.ts.net).
  server: { allowedHosts: [".ts.net"] },
  preview: { allowedHosts: [".ts.net"] },
  plugins: [
    react(),
    tailwindcss(),
  ],
})
