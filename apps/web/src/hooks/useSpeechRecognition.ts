import type { UseSpeechRecognitionReturn } from '@/ts/Interfaces'

import { useState, useCallback, useRef, useEffect } from 'react'
import getTranscriber from '@/lib/whisperTranscriber'

const useSpeechRecognition = (
    onTranscript: (text: string) => void
): UseSpeechRecognitionReturn => {
    const [isRecording, setIsRecording] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const onTranscriptRef = useRef(onTranscript)

    useEffect(() => {
        onTranscriptRef.current = onTranscript
    }, [onTranscript])

    const stopAndTranscribe = useCallback(async () => {
        const mediaRecorder = mediaRecorderRef.current
        if (!mediaRecorder || mediaRecorder.state === 'inactive') return

        return new Promise<void>((resolve) => {
            mediaRecorder.onstop = async () => {
                mediaRecorderRef.current = null
                setIsRecording(false)

                const blob = new Blob(chunksRef.current, {
                    type: mediaRecorder.mimeType
                })
                chunksRef.current = []

                if (blob.size === 0) {
                    resolve()
                    return
                }

                setIsTranscribing(true)

                try {
                    const audioContext = new AudioContext({ sampleRate: 16000 })
                    const arrayBuffer = await blob.arrayBuffer()
                    const audioBuffer =
                        await audioContext.decodeAudioData(arrayBuffer)
                    const float32Data = audioBuffer.getChannelData(0)
                    await audioContext.close()

                    const transcriber = await getTranscriber()
                    const result = await transcriber(float32Data)
                    const text = result.text?.trim()
                    if (text) {
                        onTranscriptRef.current(text)
                    }
                } catch {
                } finally {
                    setIsTranscribing(false)
                    resolve()
                }
            }

            mediaRecorder.stop()
            mediaRecorder.stream.getTracks().forEach((track) => track.stop())
        })
    }, [])

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true
            })
            const mediaRecorder = new MediaRecorder(stream)
            chunksRef.current = []

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data)
                }
            }

            mediaRecorderRef.current = mediaRecorder
            mediaRecorder.start()
            setIsRecording(true)

            getTranscriber()
        } catch {}
    }, [])

    const toggle = useCallback(() => {
        if (isRecording) {
            stopAndTranscribe()
        } else if (!isTranscribing) {
            startRecording()
        }
    }, [isRecording, isTranscribing, startRecording, stopAndTranscribe])

    useEffect(() => {
        return () => {
            if (
                mediaRecorderRef.current &&
                mediaRecorderRef.current.state !== 'inactive'
            ) {
                mediaRecorderRef.current.stop()
                mediaRecorderRef.current.stream
                    .getTracks()
                    .forEach((track) => track.stop())
            }
        }
    }, [])

    return { isRecording, isTranscribing, toggle }
}

export default useSpeechRecognition