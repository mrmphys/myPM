export async function POST(request: Request) {
  const formData = await request.formData()
  const audio = formData.get('audio') as Blob

  if (!audio) {
    return Response.json({ error: 'No audio provided' }, { status: 400 })
  }

  const buffer = Buffer.from(await audio.arrayBuffer())
  console.log('[transcribe] audio size:', buffer.length, 'type:', audio.type)

  // Try webm first, fallback to generic
  const mimeType = audio.type || 'audio/webm'

  const res = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': mimeType,
      },
      body: buffer,
    }
  )

  const data = await res.json()
  console.log('[transcribe] deepgram response:', JSON.stringify(data).slice(0, 300))

  if (!res.ok) {
    console.error('[transcribe] deepgram error:', data)
    return Response.json({ error: 'Transcription failed', detail: data }, { status: 500 })
  }

  const transcript =
    data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''

  console.log('[transcribe] transcript:', transcript)
  return Response.json({ transcript })
}
