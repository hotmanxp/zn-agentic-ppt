import { File, FileDoc, FilePdf, FilePpt } from '@phosphor-icons/react'
import type { SourceType } from '../data/types.js'

export function SourceIcon({ type, size = 18 }: { type: SourceType; size?: number }) {
  if (type === 'PDF') return <FilePdf size={size} />
  if (type === 'PPTX') return <FilePpt size={size} />
  if (type === 'DOCX') return <FileDoc size={size} />
  return <File size={size} />
}