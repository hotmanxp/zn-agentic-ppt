import { useEffect } from 'react'
import { api } from '../lib/api.js'
import { useBriefOptimizeStore } from '../stores/briefOptimize.js'
import { useWorkbenchStore } from '../stores/workbench.js'

/**
 * Mounted at Workbench root. Subscribes to brief-agent events so the
 * AskUserQuestionModal can pick them up. Filters by activeProjectId
 * so events for other projects don't bleed in.
 */
export function useWorkbenchSubscriptions(): void {
  useEffect(() => {
    const u1 = api.brief.onAskUserQuestion((e: any) => {
      const active = useWorkbenchStore.getState().activeProjectId
      if (e.projectId && active && e.projectId !== active) return
      useBriefOptimizeStore.getState().applyQuestion(e)
    })
    const u2 = api.brief.onDone((e: any) => {
      const active = useWorkbenchStore.getState().activeProjectId
      if (e.projectId && active && e.projectId !== active) return
      useBriefOptimizeStore.getState().applyDone(e.brief)
    })
    const u3 = api.brief.onError((e: any) => {
      const active = useWorkbenchStore.getState().activeProjectId
      if (e.projectId && active && e.projectId !== active) return
      useBriefOptimizeStore.getState().applyError(e.error)
    })
    return () => { u1(); u2(); u3() }
  }, [])
}