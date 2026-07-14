import React from 'react'
import ReactDOM from 'react-dom/client'
import AcademicEditorApp from './AcademicEditorApp.tsx'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AcademicEditorApp />
    </ThemeProvider>
  </React.StrictMode>,
)
