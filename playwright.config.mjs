import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',timeout:45000,workers:1,
  use:{baseURL:process.env.APP_URL||'http://127.0.0.1:8765/mi-mandado-inteligente/',
    launchOptions:{executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'},
    trace:'retain-on-failure'},
  projects:[{name:'movil-Chrome',use:{...devices['Pixel 7']}},{name:'escritorio-Chrome',use:{viewport:{width:1280,height:800}}}],
  webServer:process.env.APP_URL?undefined:{command:'node tests/server.mjs',url:'http://127.0.0.1:8765/mi-mandado-inteligente/',reuseExistingServer:true}
});
