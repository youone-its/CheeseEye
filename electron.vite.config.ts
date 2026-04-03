import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
    // Load env file based on `mode` in the current working directory.
    // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
    const env = loadEnv(mode, process.cwd(), '')

    return {
        main: {
            plugins: [externalizeDepsPlugin()],
            build: {
                rollupOptions: {
                    external: ['electron', 'fs', 'path', 'os', 'child_process']
                }
            }
        },
        preload: {
            plugins: [externalizeDepsPlugin()]
        },
        renderer: {
            plugins: [react(), tailwindcss()],
            define: {
                'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
                'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
                'import.meta.env.VITE_DEVELOPER_CODE': JSON.stringify(env.VITE_DEVELOPER_CODE)
            }
        }
    }
})
