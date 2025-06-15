import { NextResponse } from "next/server";
import puppeteer, { KeyInput } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

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

    // Fallback to a deterministic word based on date
    const fallbackWord = getFallbackWord();

    return NextResponse.json({
      word: fallbackWord,
      date: new Date().toISOString().split("T")[0],
      cached: false,
      fallback: true,
    });
  }
}

async function detectWordOfTheDay(): Promise<string> {
  // Configure chromium for serverless environment
  const isLocal = process.env.NODE_ENV === 'development';
  
  const browser = await puppeteer.launch({
    args: isLocal ? ["--no-sandbox", "--disable-setuid-sandbox"] : chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath: isLocal 
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' // Local Chrome path
      : await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();

    // Navigate to Wordle
    await page.goto("https://www.nytimes.com/games/wordle/index.html", {
      waitUntil: "networkidle2",
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
        for (const letter of word) {
          await page.keyboard.press(letter as KeyInput);
          await new Promise(resolve => setTimeout(resolve, 100));
        }

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
        for (const letter of word) {
          await page.keyboard.press(letter as KeyInput);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
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

function getFallbackWord(): string {
  const words = [
    "ADIEU",
    "AUDIO",
    "ABOUT",
    "ALONE",
    "ARISE",
    "HOUSE",
    "PHONE",
    "WORLD",
    "GREAT",
    "SMALL",
    "RIGHT",
    "PLACE",
    "WATER",
    "LIGHT",
    "MONEY",
    "STORY",
    "YOUNG",
    "POINT",
    "SPELL",
    "ROUND",
    "BUILT",
    "WHILE",
    "STUDY",
    "THINK",
    "MIGHT",
    "FOUND",
    "EVERY",
    "START",
    "LARGE",
    "WHERE",
  ];

  const today = new Date();
  const daysSinceEpoch = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));

  return words[daysSinceEpoch % words.length];
}
