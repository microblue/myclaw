import { Hono } from 'hono'
import { generateSpeech, getVoices } from '@/controllers/ai'

const app = new Hono()

app.post('/tts', generateSpeech)
app.get('/voices', getVoices)

export default app