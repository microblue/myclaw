import { sanitizeClaw } from '@/controllers/claws/helpers'

describe('sanitizeClaw', () => {
    it('removes rootPassword and adds hasRootPassword: true', () => {
        const claw = { id: '1', name: 'test', rootPassword: 'secret123' }
        const result = sanitizeClaw(claw)
        expect(result).toEqual({ id: '1', name: 'test', hasRootPassword: true })
        expect('rootPassword' in result).toBe(false)
    })

    it('sets hasRootPassword to false when no password', () => {
        const claw = { id: '1', name: 'test' }
        const result = sanitizeClaw(claw)
        expect(result).toEqual({
            id: '1',
            name: 'test',
            hasRootPassword: false
        })
    })

    it('sets hasRootPassword to false for empty string password', () => {
        const claw = { id: '1', rootPassword: '' }
        const result = sanitizeClaw(claw)
        expect(result.hasRootPassword).toBe(false)
    })

    it('preserves all other fields', () => {
        const claw = {
            id: '1',
            name: 'test',
            status: 'running',
            ip: '1.2.3.4',
            rootPassword: 'pw'
        }
        const result = sanitizeClaw(claw)
        expect(result.id).toBe('1')
        expect(result.name).toBe('test')
        expect(result.status).toBe('running')
        expect(result.ip).toBe('1.2.3.4')
    })

    it('strips centralToken even when no rootPassword is set', () => {
        const claw = {
            id: '1',
            name: 'test',
            centralToken: 'super-secret-bearer'
        }
        const result = sanitizeClaw(claw)
        expect('centralToken' in result).toBe(false)
        expect((result as Record<string, unknown>).centralToken).toBeUndefined()
    })

    it('exposes installRunId so the install-progress page can subscribe', () => {
        const claw = {
            id: '1',
            installRunId: 'run-abc',
            centralToken: 'secret'
        }
        const result = sanitizeClaw(claw) as Record<string, unknown>
        expect(result.installRunId).toBe('run-abc')
        expect(result.centralToken).toBeUndefined()
    })
})