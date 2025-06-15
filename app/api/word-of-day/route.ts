import { NextResponse } from "next/server";
import { generateZKProof } from "../../../lib/zero-knowledge-proof";
import { getTodaysWordCached, getTodaysDaysSinceLaunch } from "../../../lib/word-cache";

import crypto from 'crypto';

// Hash function for position hashes
function hashString(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0];
    
    // Use cached version which falls back to NYT API if needed
    const word = await getTodaysWordCached();
    const normalizedWord = word.toUpperCase();
    
    // Get days since launch
    const daysSinceLaunch = await getTodaysDaysSinceLaunch();

    // Generate ZK proof instead of returning plaintext word
    const salt = `wordle-${today}-salt`;
    const zkProof = generateZKProof(word, salt);

    // Generate position hashes for client-side validation
    const positionHashes: string[] = [];
    for (let i = 0; i < normalizedWord.length; i++) {
      const hash = hashString(`${i}:${normalizedWord[i]}:${salt}`);
      positionHashes.push(hash);
    }

    return NextResponse.json({
      date: today,
      method: "cached_or_nyt_api",
      zkProof: zkProof,
      positionHashes: positionHashes,
      daysSinceLaunch: daysSinceLaunch,
      // Store salt securely - in production this would be stored server-side
      // For demo purposes, we include it so client can verify proofs
      salt: salt
    });
  } catch (error) {
    console.error("Failed to get word of the day:", error);

    return NextResponse.json({
      error: "Word fetch failed",
      message: "Unable to fetch today's word.",
    }, { status: 500 });
  }
}