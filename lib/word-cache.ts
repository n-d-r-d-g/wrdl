export interface WordData {
  word: string;
  daysSinceLaunch?: number;
}

// Get word from NYT Wordle API
async function getWordFromNYT(date = new Date()): Promise<WordData> {
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
      console.log(`NYT API returned word: ${!!data.solution}, days since launch: ${!!data.days_since_launch}`);
      return {
        word: data.solution.toUpperCase(),
        daysSinceLaunch: data.days_since_launch
      };
    } else {
      throw new Error('No solution found in NYT API response');
    }
  } catch (error) {
    console.error('Failed to fetch from NYT API:', error);
    throw error;
  }
}

// Get today's word and days since launch from NYT API
export async function getTodaysWordData(): Promise<WordData> {
  console.log('Fetching today\'s word data from NYT API');
  return await getWordFromNYT();
}

// Get word data for a specific date using NYT API
export async function getWordDataForDate(date: string): Promise<WordData> {
  const wordData = await getWordFromNYT(new Date(date));
  return wordData;
}