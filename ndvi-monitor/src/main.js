import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { attachPwa } from './services/pwa'

createApp(App).use(router).mount('#app')

attachPwa()
