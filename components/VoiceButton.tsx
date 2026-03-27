'use client'

import { useState, useRef, useEffect } from 'react'

interface VoiceButtonProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

const SILENCE_THRESHOLD = 5      // RMS below this = silence
const SILENCE_DURATION_MS = 1500 // send after 1.5s of silence
const MIN_RECORD_MS = 300        // minimum chunk before we check silence

export default function VoiceButton({ onTranscript, disabled }: VoiceButtonProps) {
  const [active, setActive] = useState(false)       // mic is on
  const [speaking, setSpeaking] = useState(false)   // currently speaking
  const [processing, setProcessing] = useState(false)
  const [volume, setVolume] = useState(0)

  const activeRef = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)
  const chunkStartRef = useRef<number>(0)

  useEffect(() => {
    return () => stopAll()
  }, [])

  const stopAll = () => {
    activeRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    setActive(false)
    setSpeaking(false)
    setVolume(0)
  }

  const sendChunk = async (blob: Blob) => {
    if (blob.size < 1000) return // too small, skip

    setProcessing(true)
    const formData = new FormData()
    formData.append('audio', blob, 'chunk.webm')

    try {
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
      const data = await res.json()
      console.log('[voice] transcript:', data.transcript)
      if (data.transcript?.trim()) {
        onTranscript(data.transcript.trim())
      }
    } catch (err) {
      console.error('[voice] transcribe error:', err)
    } finally {
      setProcessing(false)
    }
  }

  const startNewChunk = (stream: MediaStream) => {
    if (!activeRef.current) return

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(stream, { mimeType })
    mediaRecorderRef.current = recorder
    chunksRef.current = []
    chunkStartRef.current = Date.now()

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      if (!activeRef.current) return
      const blob = new Blob(chunksRef.current, { type: mimeType })
      sendChunk(blob)
      // immediately start next chunk
      startNewChunk(stream)
    }

    recorder.start()
  }

  const onSilenceDetected = () => {
    if (!activeRef.current) return
    const elapsed = Date.now() - chunkStartRef.current
    if (elapsed < MIN_RECORD_MS) return

    // stop current recorder — onstop will send chunk and start new one
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setSpeaking(false)
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
      if (!activeRef.current || !analyserRef.current) return

      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / data.length) * 100
      setVolume(Math.min(rms, 100))

      const elapsed = Date.now() - chunkStartRef.current

      if (rms > SILENCE_THRESHOLD) {
        setSpeaking(true)
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
      } else if (elapsed > MIN_RECORD_MS) {
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null
            onSilenceDetected()
          }, SILENCE_DURATION_MS)
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      activeRef.current = true
      setActive(true)

      monitorAudio(stream)
      startNewChunk(stream)
    } catch (err) {
      console.error('[voice] mic error:', err)
      alert('Microphone access denied. Please allow mic access in your browser.')
    }
  }

  const handleClick = () => {
    if (disabled) return
    if (active) {
      stopAll()
    } else {
      startListening()
    }
  }

  const barHeight = Math.min(Math.max(volume * 1.5, 2), 20)

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`relative p-3 rounded-full transition-all select-none ${
        active
          ? speaking
            ? 'bg-red-500 hover:bg-red-600'
            : 'bg-orange-500 hover:bg-orange-600'
          : 'bg-gray-700 hover:bg-gray-600'
      } disabled:opacity-50`}
      title={active ? 'Click to stop' : 'Click to start voice'}
    >
      {active ? (
        <div className="flex items-end justify-center gap-0.5 w-5 h-5">
          {[0.6, 1, 0.7, 1, 0.5].map((mul, i) => (
            <div
              key={i}
              className="w-1 bg-white rounded-full transition-all duration-75"
              style={{ height: `${Math.max(speaking ? barHeight * mul : 2, 2)}px` }}
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
