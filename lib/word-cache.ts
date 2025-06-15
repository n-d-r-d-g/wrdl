import fs from 'fs/promises';
import path from 'path';

interface CachedWordEntry {
  word: string;
  timestamp: number;
}

interface WordCache {
  [date: string]: CachedWordEntry;
}

// Get today's date as a string for caching
const getTodayKey = (): string => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

// Path to store cached words (in project root)
const getCacheFilePath = (): string => {
  return path.join(process.cwd(), 'wordle-cache.json');
};

// Read cached words from file
async function readCacheFile(): Promise<WordCache> {
  try {
    const cacheFilePath = getCacheFilePath();
    const data = await fs.readFile(cacheFilePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    // File doesn't exist or is corrupted, return empty object
    return {};
  }
}

// Write cached words to file
async function writeCacheFile(cache: WordCache): Promise<void> {
  try {
    const cacheFilePath = getCacheFilePath();
    await fs.writeFile(cacheFilePath, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to write word cache:', error);
  }
}

// Clean up old cache entries (keep last 30 days)
function cleanOldEntries(cache: WordCache): WordCache {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const cleanedCache: WordCache = {};
  
  for (const [date, entry] of Object.entries(cache)) {
    if (entry.timestamp > thirtyDaysAgo) {
      cleanedCache[date] = entry;
    }
  }
  
  return cleanedCache;
}

// Get word from NYT Wordle API
async function getWordFromNYT(date = new Date()): Promise<string> {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
  const url = `https://www.nytimes.com/svc/wordle/v2/${dateStr}.json`;
  
  console.log(`Fetching word from NYT API: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`NYT API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.solution) {
      console.log(`NYT API returned word: ${data.solution.toUpperCase()}`);
      return data.solution.toUpperCase();
    } else {
      throw new Error('No solution found in NYT API response');
    }
  } catch (error) {
    console.error('Failed to fetch from NYT API:', error);
    throw error;
  }
}

// Word detection using NYT API
async function detectWordOfTheDay(): Promise<string> {
  console.log('Using NYT API for word detection');
  return await getWordFromNYT();
}

// Get today's word from cache or generate using algorithm
export async function getTodaysWordCached(): Promise<string> {
  const today = getTodayKey();
  
  try {
    // Read existing cache
    let cache = await readCacheFile();
    
    // Check if we have today's word cached
    const todaysEntry = cache[today];
    if (todaysEntry) {
      console.log(`Using cached word for ${today}: ${todaysEntry.word}`);
      return todaysEntry.word;
    }
    
    // We don't have today's word, generate it using the algorithm
    console.log(`Generating new word for ${today} using Wordle algorithm...`);
    const word = await detectWordOfTheDay();
    
    // Add to cache
    cache[today] = {
      word: word,
      timestamp: Date.now()
    };
    
    // Clean up old entries and save
    cache = cleanOldEntries(cache);
    await writeCacheFile(cache);
    
    console.log(`Cached new word for ${today}: ${word}`);
    return word;
    
  } catch (error) {
    console.error('Error getting cached word:', error);
    throw error;
  }
}

// Get cached word for a specific date (useful for testing)
export async function getWordForDate(date: string): Promise<string | null> {
  try {
    const cache = await readCacheFile();
    const entry = cache[date];
    return entry ? entry.word : null;
  } catch (error) {
    console.error('Error reading cache:', error);
    return null;
  }
}

// Generate word for a specific date using NYT API
export async function getWordForDateDirect(date: string): Promise<string> {
  return await getWordFromNYT(new Date(date));
}

// Manually cache a word for a specific date (useful for testing)
export async function cacheWordForDate(date: string, word: string): Promise<void> {
  try {
    let cache = await readCacheFile();
    
    // Add or update entry for this date
    cache[date] = {
      word,
      timestamp: Date.now()
    };
    
    // Clean and save
    cache = cleanOldEntries(cache);
    await writeCacheFile(cache);
  } catch (error) {
    console.error('Error caching word:', error);
    throw error;
  }
}