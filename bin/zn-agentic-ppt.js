#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronBin from 'electron'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const main = join(__dirname, '..', 'dist', 'main', 'index.js')
spawn(electronBin, [main], { stdio: 'inherit' })
