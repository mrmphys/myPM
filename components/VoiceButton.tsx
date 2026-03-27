'use client'

import { useState, useRef, useEffect } from 'react'

interface VoiceButtonProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

const SILENCE_THRESHOLD = 5       // RMS level below this = silence (lower = less sensitive)
const SILENCE_DURATION_MS = 2000  // stop after 2s of silence
const MIN_RECORD_MS = 2000        // don't stop before 2s minimum

export default function VoiceButton({ onTranscript, disabled }: VoiceButtonProps) {
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [volume, setVolume] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const stoppingRef = useRef(false)

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (audioContextRef.current) audioContextRef.current.close()
    audioContextRef.current = null
    analyserRef.current = null
  }

  const stopRecording = () => {
    if (stoppingRef.current) return
    stoppingRef.current = true

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    setRecording(false)
    setVolume(0)

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }

  const monitorAudio = (stream: MediaStream) => {
    const audioCtx = new AudioContext()
    audioContextRef.current = audioCtx
    const analyser = audioCtx.createAnalyser()
    analyserRef.current = analyser
    analyser.fftSize = 512

    const source = audioCtx.createMediaStreamSource(stream)
    source.connect(analyser)

    const data = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      if (!analyserRef.current) return

      analyser.getByteTimeDomainData(data)

      // calculate RMS volume
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const val = (data[i] - 128) / 128
        sum += val * val
      }
      const rms = Math.sqrt(sum / data.length) * 100
      setVolume(Math.min(rms, 100))

      const elapsed = Date.now() - startTimeRef.current

      if (elapsed > MIN_RECORD_MS) {
        if (rms < SILENCE_THRESHOLD) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              stopRecording()
            }, SILENCE_DURATION_MS)
          }
        } else {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
            silenceTimerRef.current = null
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }

  const startRecording = async () => {
    try {
      stoppingRef.current = false
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())

        if (chunksRef.current.length === 0) {
          console.warn('[voice] no audio chunks recorded')
          setProcessing(false)
          stoppingRef.current = false
          return
        }

        const mimeType = mediaRecorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        console.log('[voice] blob size:', blob.size, 'mime:', mimeType)
        setProcessing(true)

        const formData = new FormData()
        formData.append('audio', blob, 'recording.webm')

        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
          const data = await res.json()
          console.log('[voice] transcribe response:', data)
          if (data.transcript?.trim()) {
            onTranscript(data.transcript.trim())
          } else {
            console.warn('[voice] empty transcript', data)
          }
        } catch (err) {
          console.error('[voice] transcription error:', err)
        } finally {
          setProcessing(false)
          stoppingRef.current = false
        }
      }

      startTimeRef.current = Date.now()
      mediaRecorder.start()
      setRecording(true)
      monitorAudio(stream)
    } catch (err) {
      console.error('Mic error:', err)
      alert('Microphone access denied. Please allow mic access in your browser.')
    }
  }

  const handleClick = () => {
    if (disabled || processing) return
    if (recording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // volume bar height for visual feedback
  const barHeight = Math.min(Math.max(volume * 1.5, 2), 20)

  return (
    <button
      onClick={handleClick}
      disabled={disabled || processing}
      className={`relative p-3 rounded-full transition-all select-none ${
        recording
          ? 'bg-red-500 hover:bg-red-600'
          : processing
          ? 'bg-gray-600 cursor-wait'
          : 'bg-gray-700 hover:bg-gray-600'
      } disabled:opacity-50`}
      title={recording ? 'Click to cancel' : 'Click to speak'}
    >
      {processing ? (
        <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      ) : recording ? (
        <div className="flex items-end justify-center gap-0.5 w-5 h-5">
          {[0.6, 1, 0.7, 1, 0.5].map((mul, i) => (
            <div
              key={i}
              className="w-1 bg-white rounded-full transition-all duration-75"
              style={{ height: `${Math.max(barHeight * mul, 2)}px` }}
            />
          ))}
        </div>
      ) : (
        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zm0 2a2 2 0 00-2 2v6a2 2 0 004 0V5a2 2 0 00-2-2zm-7 9a1 1 0 012 0 5 5 0 0010 0 1 1 0 012 0 7 7 0 01-6 6.93V21h3a1 1 0 010 2H8a1 1 0 010-2h3v-2.07A7 7 0 015 12z" />
        </svg>
      )}
    </button>
  )
}
