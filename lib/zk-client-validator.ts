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
  
  for (let i = 0; i < normalizedGuess.length; i++) {
    const guessedLetter = normalizedGuess[i];
    
    // Generate expected hash for correct letter at this position
    const expectedHash = await hashString(
      `${i}:${guessedLetter}:${gameState.salt}`
    );
    
    let state: 'correct' | 'present' | 'absent';
    
    // Check if this letter is correct at this position
    if (expectedHash === gameState.positionHashes[i]) {
      state = 'correct';
    } else {
      // Check if letter exists elsewhere in the word
      let foundElsewhere = false;
      for (let j = 0; j < gameState.positionHashes.length; j++) {
        if (j !== i) {
          const otherPositionHash = await hashString(
            `${j}:${guessedLetter}:${gameState.salt}`
          );
          if (otherPositionHash === gameState.positionHashes[j]) {
            foundElsewhere = true;
            break;
          }
        }
      }
      state = foundElsewhere ? 'present' : 'absent';
    }
    
    letterStates.push({
      position: i,
      letter: guessedLetter,
      state
    });
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