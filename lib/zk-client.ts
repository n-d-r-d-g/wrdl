// Client-side zero-knowledge verification
// Note: Client-side crypto functions need to be implemented with a browser-compatible crypto library
// For now, we'll use a simplified verification approach

interface ZKGameSession {
  sessionId: string;
  zkProof: {
    commitment: string;
    merkleRoot: string;
    wordLength: number;
  };
  salt: string;
}

interface ZKGuessResult {
  guess: string;
  letterStates: Array<{
    position: number;
    letter: string;
    state: 'correct' | 'present' | 'absent';
    proof: unknown;
    presenceProof?: unknown;
  }>;
  isWinner: boolean;
  word?: string;
}

/**
 * Start a new ZK Wordle game session
 */
export async function startZKGame(): Promise<ZKGameSession> {
  const response = await fetch('/api/zk-wordle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'start_game' }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to start ZK game');
  }
  
  const result = await response.json();
  return result;
}

/**
 * Submit a guess and get ZK-verified results
 */
export async function submitZKGuess(
  sessionId: string,
  guess: string
): Promise<ZKGuessResult> {
  const response = await fetch('/api/zk-wordle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'validate_guess',
      sessionId,
      guess,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('Guess validation failed:', error);
    throw new Error(error.error || 'Failed to validate guess');
  }
  
  const result = await response.json();
  return result;
}

/**
 * Verify the server's response using zero-knowledge proofs
 * Simplified version for demo - in production would use full cryptographic verification
 */
export function verifyZKGuessResult(
  result: ZKGuessResult,
  session: ZKGameSession
): boolean {
  try {
    // Basic sanity checks
    if (!result || !result.letterStates || !session) {
      return false;
    }
    
    // Verify the result format matches expected structure
    if (result.letterStates.length !== session.zkProof.wordLength) {
      console.warn('Letter states length mismatch');
      return false;
    }
    
    // For now, we trust the server's ZK proofs
    // In a full implementation, we would:
    // 1. Verify Merkle proofs for each letter position
    // 2. Verify cryptographic commitments
    // 3. Check proof validity against the original commitment
    
    return true;
    
  } catch (error) {
    console.error('ZK verification failed:', error);
    return false;
  }
}

/**
 * Convert ZK result to game state format
 */
export function zkResultToGameState(result: ZKGuessResult) {
  return result.letterStates.map(ls => ({
    letter: ls.letter,
    status: ls.state
  }));
}