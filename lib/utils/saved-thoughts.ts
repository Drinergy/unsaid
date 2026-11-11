/**
 * Saved thoughts utility (localStorage only, privacy-safe)
 * Manages saved thoughts for "read later" functionality
 *
 * @author CKD
 * @created 2026-01-23
 */

const SAVED_THOUGHTS_KEY = 'unsaid_saved_thoughts';

export interface SavedThought {
  id: string;
  content: string;
  city?: string;
  countryCode: string;
  savedAt: string;
}

export function getSavedThoughts(): SavedThought[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const saved = localStorage.getItem(SAVED_THOUGHTS_KEY);
    if (!saved) return [];
    return JSON.parse(saved) as SavedThought[];
  } catch (error) {
    console.error('Error reading saved thoughts:', error);
    return [];
  }
}

export function saveThought(thought: Omit<SavedThought, 'savedAt'>): void {
  if (typeof window === 'undefined') return;
  
  try {
    const saved = getSavedThoughts();
    // Check if already saved
    if (saved.some((t) => t.id === thought.id)) {
      return;
    }
    
    const newThought: SavedThought = {
      ...thought,
      savedAt: new Date().toISOString(),
    };
    
    saved.push(newThought);
    localStorage.setItem(SAVED_THOUGHTS_KEY, JSON.stringify(saved));
  } catch (error) {
    console.error('Error saving thought:', error);
  }
}

export function removeSavedThought(thoughtId: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const saved = getSavedThoughts();
    const filtered = saved.filter((t) => t.id !== thoughtId);
    localStorage.setItem(SAVED_THOUGHTS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error removing saved thought:', error);
  }
}

export function isThoughtSaved(thoughtId: string): boolean {
  if (typeof window === 'undefined') return false;
  
  const saved = getSavedThoughts();
  return saved.some((t) => t.id === thoughtId);
}

export function exportSavedThoughts(): string {
  const saved = getSavedThoughts();
  return saved
    .map((t) => {
      const date = new Date(t.savedAt).toLocaleDateString();
      const location = t.city ? `${t.city}, ${t.countryCode}` : t.countryCode;
      return `[${date}] ${location}\n${t.content}\n`;
    })
    .join('\n---\n\n');
}
