import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright-core';

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

// Detect word of the day from Wordle website
async function detectWordOfTheDay(): Promise<string> {
  // Check if we're in a serverless environment without browser support
  const isNetlify = !!(
    process.env.NETLIFY ||
    process.env.NETLIFY_DEV ||
    process.env.CONTEXT ||
    process.env.DEPLOY_URL ||
    typeof window === 'undefined' && process.env.NODE_ENV === 'production'
  );
  const isLocal = process.env.NODE_ENV === 'development';
  
  if (isNetlify) {
    // Playwright doesn't work in Netlify's serverless environment
    console.log('Detected serverless environment, browser automation unavailable');
    throw new Error('Browser automation not available in serverless environment');
  }
  
  const browser = await chromium.launch({
    headless: true,
    args: isLocal 
      ? []
      : [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process'
        ]
  });
  
  try {
    const page = await browser.newPage();
    
    // Set user agent to avoid bot detection
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    
    // Navigate to Wordle
    await page.goto('https://www.nytimes.com/games/wordle/index.html', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Handle welcome screen and modals that appear on first load
    try {
      // Wait for welcome content and click Play button
      await page.waitForSelector('[data-testid="welcome-content"]', { timeout: 5000 });
      
      await page.click('[data-testid="Play"]');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Handle modal that appears after clicking Play
      await page.waitForSelector('[data-testid="modal-overlay"]', { timeout: 5000 });
      
      await page.click('[aria-label="Close"]');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch {
      // Welcome screen or modal not found, proceeding...
    }
    
    // Now wait for the game board to appear
    try {
      await page.waitForSelector('[data-testid="tile"]', { timeout: 10000 });
    } catch {
      // Try waiting for board class as fallback
      try {
        await page.waitForSelector('[class*="Board"]', { timeout: 5000 });
      } catch {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Strategy: Try strategic words and use feedback to determine the answer
    const strategicWords = ['ADIEU', 'ROAST', 'CLUMP'];
    let foundWord: string | null = null;
    
    for (const word of strategicWords) {
      try {
        // Type the word
        await page.keyboard.type(word, { delay: 100 });
        
        // Press Enter
        await page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if we won by looking for the regiwall dialog or completed row
        const gameWon = await page.evaluate(() => {
          // Check for the registration dialog that appears on win
          const regiDialog = document.querySelector('#regiwall-dialog');
          if (regiDialog) {
            return true;
          }
          
          // Check if we have a completed row with all correct tiles
          const tiles = document.querySelectorAll('[data-testid="tile"]');
          let currentRow: Element[] = [];
          
          for (const tile of tiles) {
            currentRow.push(tile);
            if (currentRow.length === 5) {
              // Check if this row is all correct
              const allCorrect = currentRow.every(t => t.getAttribute('data-state') === 'correct');
              if (allCorrect) {
                return true;
              }
              currentRow = [];
            }
          }
          
          return false;
        });
        
        if (gameWon) {
          foundWord = word;
          break;
        }
        
        // If we won, extract the word from the completed row
        if (gameWon) {
          const winningWord = await page.evaluate(() => {
            const tiles = document.querySelectorAll('[data-testid="tile"]');
            let currentRow: string[] = [];
            
            for (const tile of tiles) {
              const letter = tile.textContent?.trim().toUpperCase() || '';
              
              currentRow.push(letter);
              
              if (currentRow.length === 5) {
                // Check if this row is all correct
                const rowTiles = Array.from(tiles).slice(currentRow.length - 5, currentRow.length);
                const allCorrect = rowTiles.every(t => t.getAttribute('data-state') === 'correct');
                
                if (allCorrect && currentRow.every(l => l && /[A-Z]/.test(l))) {
                  return currentRow.join('');
                }
                currentRow = [];
              }
            }
            return null;
          });
          
          if (winningWord) {
            return winningWord;
          }
        }
        
      } catch (wordError) {
        console.log(`Error trying word ${word}:`, wordError);
        continue;
      }
    }
    
    if (foundWord) {
      return foundWord;
    }
    
    // Continue with more words if needed
    const remainingWords = ['THINK', 'PHONE', 'SPELL'];
    
    for (const word of remainingWords) {
      try {
        await page.keyboard.type(word, { delay: 100 });
        await page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch {
        // Continue even if there's an error
      }
    }
    
    // Try to extract the answer from the toast message that appears on loss
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const answer = await page.evaluate(() => {
      // Look for the toast container with the current structure
      const toastContainers = Array.from(document.querySelectorAll('[id]')).filter(el => 
        el.id.startsWith('ToastContainer-module_gameToaster__')
      );
      
      for (const container of toastContainers) {
        const text = container.textContent || '';
        console.log(`Found toast text:`, text);
        
        // Look for patterns specifically for the loss message
        // Common patterns: "The word was XXXXX", "XXXXX was the word", etc.
        const patterns = [
          /the word was ([A-Z]{5})/i,
          /word was ([A-Z]{5})/i,
          /answer was ([A-Z]{5})/i,
          /solution was ([A-Z]{5})/i,
          /was ([A-Z]{5})/i,
          /^([A-Z]{5}) was/i,
          /\b([A-Z]{5})\b/g  // Any 5-letter word as fallback
        ];
        
        for (const pattern of patterns) {
          const matches = text.match(pattern);
          if (matches) {
            const word = matches[1] || matches[0];
            if (word && word.length === 5 && /^[A-Z]+$/i.test(word)) {
              return word.toUpperCase();
            }
          }
        }
      }
      
      return null;
    });
    
    if (answer) {
      return answer;
    }
    
    // If all else fails, try one more approach: look at the game board state
    console.log('Attempting to extract from game board...');
    
    const boardAnswer = await page.evaluate(() => {
      // Extract from the current board structure using data-testid="tile"
      const tiles = document.querySelectorAll('[data-testid="tile"]');
      if (tiles.length >= 5) {
        const rows: { letters: string[], states: string[] }[] = [];
        let currentRow = { letters: [] as string[], states: [] as string[] };
        
        tiles.forEach((tile: Element) => {
          // Get letter from text content (should be lowercase in the HTML)
          const letter = tile.textContent?.trim().toUpperCase() || '';
          const state = tile.getAttribute('data-state') || '';
          
          currentRow.letters.push(letter);
          currentRow.states.push(state);
          
          if (currentRow.letters.length === 5) {
            rows.push({ ...currentRow });
            currentRow = { letters: [], states: [] };
          }
        });
        
        // Look for the last row that has any filled letters (even if not all correct)
        // This helps us extract the word even from partial guesses
        for (let i = rows.length - 1; i >= 0; i--) {
          const row = rows[i];
          const hasLetters = row.letters.some(letter => letter && /[A-Z]/.test(letter));
          
          if (hasLetters) {
            const word = row.letters.join('');
            if (word.length === 5 && /^[A-Z]+$/.test(word)) {
              return word;
            }
          }
        }
      }
      
      return null;
    });
    
    if (boardAnswer) {
      return boardAnswer;
    }
    
    // If all else fails, throw error (no fallback)
    throw new Error('Could not extract word from Wordle website');
    
  } finally {
    await browser.close();
  }
}

// Get today's word from cache or fetch and cache it
export async function getTodaysWordCached(): Promise<string> {
  const today = getTodayKey();
  
  try {
    // Read existing cache
    let cache = await readCacheFile();
    
    // Check if we have today's word cached
    const todaysEntry = cache[today];
    if (todaysEntry) {
      console.log(`Using cached word for ${today}`);
      return todaysEntry.word;
    }
    
    // We don't have today's word, fetch it
    console.log(`Fetching new word for ${today}...`);
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
    throw error; // Let the original error bubble up
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