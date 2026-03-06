import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import axios from 'axios'

// Set axios base URL for production
if (!import.meta.env.DEV) {
  axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
