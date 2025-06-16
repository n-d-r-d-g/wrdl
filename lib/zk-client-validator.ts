// Client-side zero-knowledge validation for Wordle
// This module validates guesses locally using ZK proofs without server round-trips

interface ZKProof {
  commitment: string;
  merkleRoot: string;
  wordLength: number;
}

interface ZKGameState {
  zkProof: ZKProof;
  salt: string;
  date: string;
  positionHashes: string[];
}

interface LetterState {
  position: number;
  letter: string;
  state: 'correct' | 'present' | 'absent';
}

interface GuessResult {
  letterStates: LetterState[];
  isWinner: boolean;
  guess: string;
}

// Browser-compatible hash function (matches server-side crypto.createHash)
async function hashString(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Validate a guess against the ZK proof using position hashes
export async function validateGuessWithZK(
  guess: string,
  gameState: ZKGameState
): Promise<GuessResult> {
  const normalizedGuess = guess.toUpperCase();
  
  if (normalizedGuess.length !== gameState.zkProof.wordLength) {
    throw new Error('Invalid guess length');
  }

  if (gameState.positionHashes.length !== gameState.zkProof.wordLength) {
    throw new Error('Invalid position hashes');
  }

  const letterStates: LetterState[] = [];
  
  // First pass: identify all correct positions
  const correctPositions = new Set<number>();
  for (let i = 0; i < normalizedGuess.length; i++) {
    const guessedLetter = normalizedGuess[i];
    const expectedHash = await hashString(
      `${i}:${guessedLetter}:${gameState.salt}`
    );
    
    if (expectedHash === gameState.positionHashes[i]) {
      correctPositions.add(i);
      letterStates.push({
        position: i,
        letter: guessedLetter,
        state: 'correct'
      });
    } else {
      // Placeholder for now
      letterStates.push({
        position: i,
        letter: guessedLetter,
        state: 'absent'
      });
    }
  }
  
  // Second pass: count available letters in target word (excluding correct positions)
  const availableLetterCount = new Map<string, number>();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  for (let targetPos = 0; targetPos < gameState.positionHashes.length; targetPos++) {
    if (correctPositions.has(targetPos)) continue;
    
    // For each non-correct position in target, find which letter it represents
    for (const testLetter of alphabet) {
      const testHash = await hashString(
        `${targetPos}:${testLetter}:${gameState.salt}`
      );
      
      if (testHash === gameState.positionHashes[targetPos]) {
        availableLetterCount.set(
          testLetter,
          (availableLetterCount.get(testLetter) || 0) + 1
        );
        break;
      }
    }
  }
  
  // Third pass: assign present/absent status considering letter frequency
  const usedLetterCount = new Map<string, number>();
  for (let i = 0; i < normalizedGuess.length; i++) {
    if (correctPositions.has(i)) continue;
    
    const guessedLetter = normalizedGuess[i];
    const availableCount = availableLetterCount.get(guessedLetter) || 0;
    const usedCount = usedLetterCount.get(guessedLetter) || 0;
    
    if (availableCount > usedCount) {
      letterStates[i].state = 'present';
      usedLetterCount.set(guessedLetter, usedCount + 1);
    } else {
      letterStates[i].state = 'absent';
    }
  }
  
  // Check if all letters are correct
  const isWinner = letterStates.every(ls => ls.state === 'correct');
  
  return {
    letterStates,
    isWinner,
    guess: normalizedGuess
  };
}

// Initialize ZK game state from the word-of-day API response
export function initializeZKGameState(
  zkProof: ZKProof,
  salt: string,
  date: string,
  positionHashes: string[]
): ZKGameState {
  return {
    zkProof,
    salt,
    date,
    positionHashes
  };
}

// Verify that a ZK proof is valid (basic checks)
export function verifyZKProof(zkProof: ZKProof): boolean {
  return !!(
    zkProof.commitment &&
    zkProof.merkleRoot &&
    zkProof.wordLength === 5 &&
    zkProof.commitment.length === 64 && // SHA-256 hex string
    zkProof.merkleRoot.length === 64   // SHA-256 hex string
  );
}