import { NextResponse } from "next/server";
import { chromium } from "playwright-core";

export async function GET() {
  try {
    // Check if we already cached today's word
    const today = new Date().toISOString().split("T")[0];

    // In a production app, you'd use a proper cache/database
    // For now, we'll detect the word each time (with client-side caching)

    const word = await detectWordOfTheDay();

    return NextResponse.json({
      word: word,
      date: today,
      cached: false,
    });
  } catch (error) {
    console.error("Failed to detect word of the day:", error);

    // Return error instead of fallback - daily mode should be disabled
    return NextResponse.json({
      error: "Word detection failed",
      message: "Unable to detect today's word. Daily mode is unavailable.",
    }, { status: 503 });
  }
}

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
  
  console.log('Environment:', { 
    isLocal, 
    isNetlify, 
    nodeEnv: process.env.NODE_ENV,
    netlifyEnv: process.env.NETLIFY,
    context: process.env.CONTEXT,
    deployUrl: process.env.DEPLOY_URL
  });

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

    // Navigate to Wordle
    await page.goto("https://www.nytimes.com/games/wordle/index.html", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Wait for the game to load
    await page.waitForSelector('[data-testid="wordle-app-game"]', {
      timeout: 10000,
    });

    // Strategy: Try strategic words and use feedback to determine the answer
    const strategicWords = ["ADIEU", "ROAST", "CLUMP"];
    let foundWord: string | null = null;

    for (const word of strategicWords) {
      try {
        // Type the word
        await page.keyboard.type(word, { delay: 100 });

        // Press Enter
        await page.keyboard.press("Enter");
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if we won
        const gameWon = await page.evaluate(() => {
          const toastElement = document.querySelector(
            '[data-testid="toast-message"]'
          );
          return (
            toastElement?.textContent?.includes("Magnificent") ||
            toastElement?.textContent?.includes("Genius") ||
            toastElement?.textContent?.includes("Splendid") ||
            document.querySelector('[data-testid="game-win-message"]') !== null
          );
        });

        if (gameWon) {
          foundWord = word;
          break;
        }

        // If not won, continue with next word
      } catch (wordError) {
        console.log(`Error trying word ${word}:`, wordError);
        continue;
      }
    }

    if (foundWord) {
      return foundWord;
    }

    // If we didn't find it through guessing, try to extract from the page after failure
    // Continue guessing until we lose, then extract the answer
    const remainingWords = ["THINK", "PHONE", "SPELL"];

    for (const word of remainingWords) {
      try {
        await page.keyboard.type(word, { delay: 100 });
        await page.keyboard.press("Enter");
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch {
        // Continue even if there's an error
      }
    }

    // Try to extract the answer from the loss screen
    await new Promise(resolve => setTimeout(resolve, 3000));

    const answer = await page.evaluate(() => {
      // Look for common selectors where Wordle shows the answer
      const selectors = [
        '[data-testid="game-loss-message"]',
        ".toast-message",
        '[data-testid="toast-message"]',
        ".game-over-message",
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.textContent || "";
          const wordMatch = text.match(/\b[A-Z]{5}\b/);
          if (wordMatch) {
            return wordMatch[0];
          }
        }
      }

      return null;
    });

    if (answer) {
      return answer;
    }

    // If all else fails, use fallback
    throw new Error("Could not extract word from Wordle website");
  } finally {
    await browser.close();
  }
}
