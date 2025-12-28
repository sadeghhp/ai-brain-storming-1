// ============================================
// AI Brainstorm - Language Constants
// Version: 1.2.0
// ============================================

/**
 * Language definition for conversation target language
 */
export interface Language {
  code: string;      // e.g., 'Spanish' or '' for default English
  name: string;      // Display name
  nativeName: string; // Native language name
}

/**
 * Master list of all available languages
 * The first entry (empty code) represents the default English option
 */
export const ALL_LANGUAGES: Language[] = [
  { code: '', name: 'Default (English)', nativeName: 'English' },
  { code: 'Persian', name: 'Persian', nativeName: 'فارسی' },
  { code: 'Spanish', name: 'Spanish', nativeName: 'Español' },
  { code: 'French', name: 'French', nativeName: 'Français' },
  { code: 'German', name: 'German', nativeName: 'Deutsch' },
  { code: 'Italian', name: 'Italian', nativeName: 'Italiano' },
  { code: 'Portuguese', name: 'Portuguese', nativeName: 'Português' },
  { code: 'Dutch', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'Russian', name: 'Russian', nativeName: 'Русский' },
  { code: 'Chinese (Simplified)', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'Chinese (Traditional)', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
  { code: 'Japanese', name: 'Japanese', nativeName: '日本語' },
  { code: 'Korean', name: 'Korean', nativeName: '한국어' },
  { code: 'Arabic', name: 'Arabic', nativeName: 'العربية' },
  { code: 'Hindi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'Turkish', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'Polish', name: 'Polish', nativeName: 'Polski' },
  { code: 'Swedish', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'Norwegian', name: 'Norwegian', nativeName: 'Norsk' },
  { code: 'Danish', name: 'Danish', nativeName: 'Dansk' },
  { code: 'Finnish', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'Greek', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'Hebrew', name: 'Hebrew', nativeName: 'עברית' },
  { code: 'Thai', name: 'Thai', nativeName: 'ไทย' },
  { code: 'Vietnamese', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'Indonesian', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'Czech', name: 'Czech', nativeName: 'Čeština' },
  { code: 'Hungarian', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'Romanian', name: 'Romanian', nativeName: 'Română' },
  { code: 'Ukrainian', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'Bengali', name: 'Bengali', nativeName: 'বাংলা' },
];

/**
 * Get enabled languages based on user settings
 * @param enabledCodes Array of language codes enabled by user (from AppSettings)
 * @returns Filtered list of languages
 */
export function getEnabledLanguages(enabledCodes: string[]): Language[] {
  // Always include English (empty code)
  const codes = new Set(enabledCodes);
  codes.add('');
  
  return ALL_LANGUAGES.filter(lang => codes.has(lang.code));
}

/**
 * Set of RTL (Right-to-Left) language codes
 */
const RTL_LANGUAGES = new Set(['Persian', 'Arabic', 'Hebrew']);

/**
 * Check if a language code is RTL (Right-to-Left)
 * @param languageCode The language code to check
 * @returns true if the language is RTL
 */
export function isRTLLanguage(languageCode: string): boolean {
  return RTL_LANGUAGES.has(languageCode);
}

