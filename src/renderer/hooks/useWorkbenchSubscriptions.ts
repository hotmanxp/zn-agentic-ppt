import { useEffect } from 'react'
import { api } from '../lib/api.js'
import { useBriefOptimizeStore } from '../stores/briefOptimize.js'

/**
 * Mounted at Workbench root. Subscribes to brief-agent events so the
 * AskUserQuestionModal can pick them up.
 */
export function useWorkbenchSubscriptions(): void {
  useEffect(() => {
    const u1 = api.brief.onAskUserQuestion((e: any) => useBriefOptimizeStore.getState().applyQuestion(e))
    const u2 = api.brief.onDone((e: any) => useBriefOptimizeStore.getState().applyDone(e.brief))
    const u3 = api.brief.onError((e: any) => useBriefOptimizeStore.getState().applyError(e.error))
    return () => { u1(); u2(); u3() }
  }, [])
}