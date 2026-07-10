import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { useStandaloneMode } from './hooks/useStandaloneMode.ts'
import { getSessionStorageItem, removeSessionStorageItem, setSessionStorageItem } from './utils/browserStorage.ts'
import { parseStoredScrollY } from './utils/scrollRestoration.ts'

const STANDALONE_SCROLL_KEY = 'diary_scroll_y'

function Root() {
  const isStandalone = useStandaloneMode()

  React.useEffect(() => {
    let frameId: number | null = null

    const updateViewportHeight = () => {
      if (frameId !== null) {
        return
      }

      frameId = window.requestAnimationFrame(() => {
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight
        document.documentElement.style.setProperty('--app-height', `${viewportHeight}px`)
        frameId = null
      })
    }

    updateViewportHeight()
    window.visualViewport?.addEventListener('resize', updateViewportHeight)
    window.visualViewport?.addEventListener('scroll', updateViewportHeight)
    window.addEventListener('resize', updateViewportHeight)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      window.visualViewport?.removeEventListener('resize', updateViewportHeight)
      window.visualViewport?.removeEventListener('scroll', updateViewportHeight)
      window.removeEventListener('resize', updateViewportHeight)
    }
  }, [])

  React.useEffect(() => {
    document.documentElement.classList.toggle('display-standalone', isStandalone)
    document.body.classList.toggle('display-standalone', isStandalone)
    document.getElementById('root')?.classList.toggle('display-standalone', isStandalone)

    return () => {
      document.documentElement.classList.remove('display-standalone')
      document.body.classList.remove('display-standalone')
      document.getElementById('root')?.classList.remove('display-standalone')
    }
  }, [isStandalone])

  React.useEffect(() => {
    if (!isStandalone) {
      removeSessionStorageItem(STANDALONE_SCROLL_KEY)
      return
    }

    let restoreFrameId: number | null = null

    const restoreScroll = () => {
      const savedScroll = getSessionStorageItem(STANDALONE_SCROLL_KEY)

      if (!savedScroll) {
        return
      }

      const parsedScroll = parseStoredScrollY(savedScroll)

      if (parsedScroll === null) {
        return
      }

      if (restoreFrameId !== null) {
        window.cancelAnimationFrame(restoreFrameId)
      }

      restoreFrameId = window.requestAnimationFrame(() => {
        window.scrollTo({ top: parsedScroll, behavior: 'auto' })
        restoreFrameId = null
      })
    }

    const saveScroll = () => {
      setSessionStorageItem(STANDALONE_SCROLL_KEY, String(window.scrollY))
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveScroll()
        return
      }

      restoreScroll()
    }

    restoreScroll()
    window.addEventListener('pagehide', saveScroll)
    window.addEventListener('pageshow', restoreScroll)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', saveScroll)
      window.removeEventListener('pageshow', restoreScroll)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (restoreFrameId !== null) {
        window.cancelAnimationFrame(restoreFrameId)
      }
    }
  }, [isStandalone])

  React.useEffect(() => {
    if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
      return
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
