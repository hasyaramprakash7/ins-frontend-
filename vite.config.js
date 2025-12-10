import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  
  // -----------------------------------------------------------------
  // ADDITIONS FOR RENDER DEPLOYMENT
  // -----------------------------------------------------------------

  // 1. Configuration for the Development Server (`npm run dev`)
  // Ensures the dev server binds to all interfaces (0.0.0.0) 
  // so Render can detect the port and route traffic.
  server: {
    host: '0.0.0.0',
    // You can set a fallback port, but Render uses $PORT
    port: process.env.PORT || 5173, 
  },

  // 2. Configuration for the Production Preview Server (`npm run start` or `vite preview`)
  // Explicitly allows the Render domain to access the application, fixing the "Blocked request" error.
  preview: {
    host: '0.0.0.0', // Bind to all interfaces (necessary for Render)
    port: process.env.PORT || 4173, // Use $PORT
    // Allow access from the Render URL
    allowedHosts: [
      'ins-frontend.onrender.com', 
      '*.onrender.com'
    ],
  },
  
  // -----------------------------------------------------------------
})