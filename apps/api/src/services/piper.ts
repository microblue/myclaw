import type { PiperModelConfig, PiperStreamResult } from '@/ts/Interfaces'

import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const PIPER_BINARY = process.env.PIPER_BINARY || 'piper'
const MODELS_DIR = path.resolve(
    process.env.PIPER_MODELS_DIR ||
        path.join(
            path.dirname(fileURLToPath(import.meta.url)),
            '..',
            '..',
            '..',
            'ai',
            'models'
        )
)

const getModelConfig = (voice: string): PiperModelConfig => {
    const configPath = path.join(MODELS_DIR, `${voice}.onnx.json`)
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    return {
        sampleRate: config.audio?.sample_rate || 22050,
        channels: 1
    }
}

const synthesizeStream = (text: string, voice: string): PiperStreamResult => {
    const modelPath = path.join(MODELS_DIR, `${voice}.onnx`)
    const { sampleRate, channels } = getModelConfig(voice)

    const child = spawn(PIPER_BINARY, ['--model', modelPath, '--output-raw'], {
        stdio: ['pipe', 'pipe', 'pipe']
    })

    if (child.stdin) {
        child.stdin.write(text)
        child.stdin.end()
    }

    return { child, sampleRate, channels }
}

export default synthesizeStream