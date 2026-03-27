export async function POST(request: Request) {
  const { text } = await request.json()

  if (!text) {
    return Response.json({ error: 'No text provided' }, { status: 400 })
  }

  const res = await fetch(
    'https://api.deepgram.com/v1/speak?model=aura-asteria-en',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    }
  )

  if (!res.ok) {
    return Response.json({ error: 'TTS failed' }, { status: 500 })
  }

  return new Response(res.body, {
    headers: { 'Content-Type': 'audio/mpeg' },
  })
}
