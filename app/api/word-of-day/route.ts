import { NextResponse } from "next/server";
import { generateZKProof } from "../../../lib/zero-knowledge-proof";
import { getTodaysWordData, type WordData } from "../../../lib/word-cache";

import crypto from 'crypto';

// Module-level cache - persists across function calls
let wordCache: { [date: string]: WordData } = {};

// Hash function for position hashes
function hashString(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const revealSolution = searchParams.get('reveal') === 'true';
  try {
    const today = new Date().toISOString().split("T")[0];
    
    let wordData: WordData;
    
    // Check if we have cached data for today
    if (wordCache[today]) {
      console.log('Using in-memory cache for', today);
      wordData = wordCache[today];
    } else {
      // Fetch fresh data from NYT API
      console.log('Fetching fresh data from NYT API for', today);
      wordData = await getTodaysWordData();
      
      // Cache it and clean up all other dates
      wordCache = { [today]: wordData };
    }
    
    const normalizedWord = wordData.word.toUpperCase();

    // Generate ZK proof instead of returning plaintext word
    const salt = `wordle-${today}-salt`;
    const zkProof = generateZKProof(wordData.word, salt);

    // Generate position hashes for client-side validation
    const positionHashes: string[] = [];
    for (let i = 0; i < normalizedWord.length; i++) {
      const hash = hashString(`${i}:${normalizedWord[i]}:${salt}`);
      positionHashes.push(hash);
    }

    const response = {
      date: today,
      method: "nyt_api",
      zkProof: zkProof,
      positionHashes: positionHashes,
      daysSinceLaunch: wordData.daysSinceLaunch,
      // Store salt securely - in production this would be stored server-side
      // For demo purposes, we include it so client can verify proofs
      salt: salt,
      solution: ""
    };
    
    // Only include solution if explicitly requested (after game over)
    if (revealSolution) {
      response.solution = normalizedWord;
    }
    
    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to get word of the day:", error);

    return NextResponse.json({
      error: "Word fetch failed",
      message: "Unable to fetch today's word.",
    }, { status: 500 });
  }
}