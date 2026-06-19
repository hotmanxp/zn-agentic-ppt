import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useProjectDetailStore } from '../stores/projectDetail.js'

export function useLoadProjectDetail(): void {
  const { id = '' } = useParams<{ id: string }>()
  const load = useProjectDetailStore(s => s.load)
  const reset = useProjectDetailStore(s => s.reset)
  const loadedProjectId = useProjectDetailStore(s => s.loadedProjectId)

  useEffect(() => {
    if (!id) return
    if (loadedProjectId === id) return
    void load(id)
  }, [id, loadedProjectId, load])

  useEffect(() => {
    return () => { reset() }
  }, [reset])
}
