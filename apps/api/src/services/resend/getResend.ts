import { Resend } from 'resend'

let _resend: Resend

const getResend = () => {
    if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
    return _resend
}

export default getResend