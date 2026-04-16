import { getAuth } from 'firebase/auth'
import app from '@/lib/firebase/config'

const auth = getAuth(app)

export default auth