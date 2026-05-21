/**
 * defaults.js — smart defaults & slug helpers.
 *
 * The product's "first value" is a *published* profile with content. A blank
 * empty state kills onboarding completion, so `smartProfileDefaults` always
 * returns a non-empty, ready-to-publish starting point.
 */

/**
 * Convert an email local-part into a friendly display name.
 * e.g. "jane.doe@x.com" -> "Jane Doe", "john_smith42" -> "John Smith42".
 */
function titleizeLocalPart(email) {
  const local = String(email ?? '').split('@')[0] || 'there';
  return local
    .split(/[._\-+]+/)         // split on common separators
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim() || 'There';
}

/**
 * Deterministically derive a hex color from an email so the same user always
 * gets the same avatar color (no randomness — stable across sessions/devices).
 */
function colorFromEmail(email) {
  const str = String(email ?? '');
  // Simple, stable string hash (djb2 variant).
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  // Map the 32-bit hash into a 24-bit color and zero-pad to 6 hex digits.
  const hex = (hash & 0xffffff).toString(16).padStart(6, '0');
  return `#${hex}`;
}

/**
 * Build a non-empty starter profile payload for a brand-new user.
 *
 * Returns displayName / headline / bio / avatarColor plus exactly two starter
 * blocks (one 'text', one 'link') so the profile is never visually empty and
 * can be published immediately — directly serving the <5 min time-to-value goal.
 *
 * @param {{email?:string}} user
 * @returns {{displayName:string, headline:string, bio:string,
 *            avatarColor:string, blocks:Array}}
 */
export function smartProfileDefaults(user = {}) {
  const email = user.email || '';
  const displayName = titleizeLocalPart(email);

  return {
    displayName,
    headline: 'Add a short headline about yourself',
    bio: 'Tell visitors who you are and what you do — a sentence or two is plenty.',
    avatarColor: colorFromEmail(email),
    // Two starter blocks eliminate the empty state. The UI agent renders these;
    // the user edits them in place during onboarding.
    blocks: [
      {
        type: 'text',
        label: 'About me',
        value: `Hi, I'm ${displayName}. This is my profile — edit this intro to make it yours.`,
      },
      {
        type: 'link',
        label: 'My website',
        value: 'https://example.com',
      },
    ],
  };
}

/**
 * Turn arbitrary text into a URL-safe slug.
 * Lowercase, ASCII only, words joined by single hyphens, no leading/trailing
 * hyphens. Falls back to "profile" when the input has no usable characters.
 *
 * @param {string} text
 * @returns {string}
 */
export function generateSlug(text) {
  const slug = String(text ?? '')
    .normalize('NFKD')                 // split accented chars into base + mark
    .replace(/[̀-ͯ]/g, '')   // strip combining diacritical marks -> ASCII
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')       // non-alphanumerics become hyphens
    .replace(/^-+|-+$/g, '');          // trim leading/trailing hyphens
  return slug || 'profile';
}

/**
 * Produce a slug guaranteed not to collide with any in `existingSlugs`.
 * If the base slug is taken, appends -2, -3, … until free.
 *
 * @param {string} text           source text for the slug
 * @param {string[]} existingSlugs slugs already in use
 * @returns {string}
 */
export function uniqueSlug(text, existingSlugs = []) {
  const taken = new Set(existingSlugs);
  const base = generateSlug(text);

  if (!taken.has(base)) return base;

  let counter = 2;
  let candidate = `${base}-${counter}`;
  while (taken.has(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}
