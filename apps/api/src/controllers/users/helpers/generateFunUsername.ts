// Used to back-fill a friendly display name on the user's first profile
// fetch when their `users.name` column is still null. The Supabase
// auth.users → public.users trigger only copies `id`, so without this
// every account starts as "{email-local-part}" in the UI which feels
// generic. A two-word "Adjective Noun" handle (e.g. "Cozy Panda")
// gives the dashboard / chat / referrals copy something to lean on
// from minute one. The user can rename via /account at any time.
//
// We cap the surface to ~30 × ~30 = ~900 unique combinations. The
// `name` column has no uniqueness constraint, so collisions are fine —
// these are display handles, not identifiers.

const ADJECTIVES = [
    'Cozy',
    'Swift',
    'Brave',
    'Calm',
    'Wild',
    'Warm',
    'Happy',
    'Lucky',
    'Fuzzy',
    'Snowy',
    'Misty',
    'Sunny',
    'Sleepy',
    'Clever',
    'Gentle',
    'Mighty',
    'Silent',
    'Golden',
    'Cosmic',
    'Polar',
    'Rusty',
    'Nimble',
    'Jolly',
    'Witty',
    'Noble',
    'Vivid',
    'Crisp',
    'Plucky',
    'Quirky',
    'Curious'
] as const

const NOUNS = [
    'Panda',
    'Otter',
    'Fox',
    'Wolf',
    'Bear',
    'Falcon',
    'Lynx',
    'Raven',
    'Crane',
    'Owl',
    'Hare',
    'Finch',
    'Heron',
    'Stoat',
    'Beaver',
    'Badger',
    'Marmot',
    'Pelican',
    'Magpie',
    'Sparrow',
    'Mongoose',
    'Capybara',
    'Tapir',
    'Pangolin',
    'Quokka',
    'Wombat',
    'Axolotl',
    'Narwhal',
    'Manatee',
    'Hedgehog'
] as const

const generateFunUsername = (): string => {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
    return `${adj} ${noun}`
}

export default generateFunUsername