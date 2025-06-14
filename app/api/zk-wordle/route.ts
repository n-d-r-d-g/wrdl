import { NextRequest, NextResponse } from 'next/server';
import { getTodaysWordCached } from '../../../lib/word-cache';
import { 
  generateZKProof, 
  generateLetterProof, 
  generateWordPresenceProof 
} from '../../../lib/zero-knowledge-proof';

// Permanent salt for ZK proofs
const ZK_SALT = 'wrdl-zk-salt-2025-permanent';

interface ZKSession {
  word: string;
  zkProof: {
    commitment: string;
    merkleRoot: string;
    wordLength: number;
  };
  date: string;
}

interface LetterProof {
  position: number;
  letter: string;
  proof: string[];
  isCorrect: boolean;
}

interface WordPresenceProof {
  isPresent: boolean;
  proof: string;
}

interface LetterState {
  position: number;
  letter: string;
  state: 'correct' | 'present' | 'absent';
  proof: LetterProof;
  presenceProof?: WordPresenceProof;
}

// In-memory session storage (in production, use Redis or database)
const zkSessions = new Map<string, ZKSession>();

function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export async function POST(request: NextRequest) {
  try {
    const { action, sessionId, guess } = await request.json();
    
    switch (action) {
      case 'start_game':
        return await handleStartGame();
        
      case 'validate_guess':
        return await handleValidateGuess(sessionId, guess);
        
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    
  } catch (error) {
    console.error('ZK Wordle API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleStartGame() {
  try {
    // Get today's word
    const word = await getTodaysWordCached();
    console.log('ZK: Starting game with word:', word);
    
    // Generate ZK proof
    const zkProof = generateZKProof(word, ZK_SALT);
    
    // Create session
    const sessionId = generateSessionId();
    zkSessions.set(sessionId, {
      word,
      zkProof,
      date: new Date().toISOString().split('T')[0]
    });
    
    console.log('ZK: Created session', sessionId, 'Total sessions:', zkSessions.size);
    
    // Return session ID and ZK proof (but not the word)
    return NextResponse.json({
      sessionId,
      zkProof: {
        commitment: zkProof.commitment,
        merkleRoot: zkProof.merkleRoot,
        wordLength: zkProof.wordLength
      },
      salt: ZK_SALT
    });
    
  } catch (error) {
    console.error('Failed to start ZK game:', error);
    return NextResponse.json({ error: 'Failed to start game' }, { status: 500 });
  }
}

async function handleValidateGuess(sessionId: string, guess: string) {
  console.log('ZK: Validating guess for session:', sessionId);
  console.log('ZK: Available sessions:', Array.from(zkSessions.keys()));
  
  if (!sessionId || !guess) {
    return NextResponse.json({ error: 'Session ID and guess required' }, { status: 400 });
  }
  
  let session = zkSessions.get(sessionId);
  if (!session) {
    console.log('ZK: Session not found. Total sessions:', zkSessions.size);
    console.log('ZK: Attempting to recreate session...');
    
    // Fallback: recreate session with today's word
    try {
      const word = await getTodaysWordCached();
      const zkProof = generateZKProof(word, ZK_SALT);
      session = {
        word,
        zkProof,
        date: new Date().toISOString().split('T')[0]
      };
      zkSessions.set(sessionId, session);
      console.log('ZK: Recreated session for:', sessionId);
    } catch (error) {
      console.error('ZK: Failed to recreate session:', error);
      return NextResponse.json({ error: 'Invalid session - could not recreate' }, { status: 404 });
    }
  }
  
  console.log('ZK: Found session for word');
  
  const normalizedGuess = guess.toUpperCase();
  const word = session.word.toUpperCase();
  
  if (normalizedGuess.length !== word.length) {
    return NextResponse.json({ error: 'Invalid guess length' }, { status: 400 });
  }
  
  // Generate proofs for each letter
  const letterProofs: LetterProof[] = [];
  const letterStates: LetterState[] = [];
  
  for (let i = 0; i < normalizedGuess.length; i++) {
    const guessedLetter = normalizedGuess[i];
    const actualLetter = word[i];
    
    // Generate letter position proof
    const letterProof = generateLetterProof(word, i, guessedLetter, ZK_SALT);
    
    // Determine letter state
    let state: 'correct' | 'present' | 'absent';
    if (actualLetter === guessedLetter) {
      state = 'correct';
    } else if (word.includes(guessedLetter)) {
      state = 'present';
    } else {
      state = 'absent';
    }
    
    // Generate word presence proof for non-correct letters
    let presenceProof: WordPresenceProof | undefined = undefined;
    if (state === 'present') {
      presenceProof = generateWordPresenceProof(word, guessedLetter, ZK_SALT);
    }
    
    letterProofs.push(letterProof);
    letterStates.push({
      position: i,
      letter: guessedLetter,
      state,
      proof: letterProof,
      presenceProof
    });
  }
  
  // Check if game is won
  const isWinner = normalizedGuess === word;
  
  return NextResponse.json({
    sessionId,
    guess: normalizedGuess,
    letterStates,
    isWinner,
    // Only reveal word if game is complete (won or lost after 6 guesses)
    word: isWinner ? word : undefined
  });
}