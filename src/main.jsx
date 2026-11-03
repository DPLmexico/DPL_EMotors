import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { loadMotorCore } from './logic/motorCore.js'

const root = createRoot(document.getElementById('root'))

loadMotorCore()
  .then((core) => {
    root.render(
      <StrictMode>
        <App core={core} />
      </StrictMode>,
    )
  })
  .catch((err) => {
    console.error(err)
    root.render(
      <p style={{ color: '#f87171', padding: 24, fontFamily: 'sans-serif' }}>
        No se pudo cargar el motor de selección (WebAssembly). Actualiza tu navegador.
      </p>,
    )
  })
