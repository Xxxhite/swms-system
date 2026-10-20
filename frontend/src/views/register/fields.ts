import type { FormRules } from 'element-plus'
import type { RegistrationInput } from '@/api/types'
export function personnelDefaults(): Omit<RegistrationInput, 'username' | 'password'> {
    return {
        name: '',
        phone: '',
        arrivalDate: '',
        major: '',
        proposedPosition: '',
        education: '',
        politicalStatus: '',
        socialWorkerNo: '',
        proposedTeam: '',
    }
}
export const personnelRules: FormRules = Object.fromEntries(
    [
        'name',
        'phone',
        'arrivalDate',
        'major',
        'proposedPosition',
        'education',
        'politicalStatus',
    ].map((key) => [key, [{ required: true, message: '请填写此项', trigger: 'change' }]]),
)
export function nullablePersonnel(input: ReturnType<typeof personnelDefaults>) {
    return {
        ...input,
        socialWorkerNo: input.socialWorkerNo?.trim() || null,
        proposedTeam: input.proposedTeam?.trim() || null,
    }
}
