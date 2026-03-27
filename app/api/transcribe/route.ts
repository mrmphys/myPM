export async function POST(request: Request) {
  const formData = await request.formData()
  const audio = formData.get('audio') as Blob

  if (!audio) {
    return Response.json({ error: 'No audio provided' }, { status: 400 })
  }

  const buffer = Buffer.from(await audio.arrayBuffer())

  const res = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'audio/webm',
      },
      body: buffer,
    }
  )

  if (!res.ok) {
    return Response.json({ error: 'Transcription failed' }, { status: 500 })
  }

  const data = await res.json()
  const transcript =
    data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''

  return Response.json({ transcript })
}
