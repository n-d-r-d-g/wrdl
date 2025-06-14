import { NextRequest, NextResponse } from 'next/server';
import { getTodaysWordCached } from '../../../lib/word-cache';

export async function POST(request: NextRequest) {
  try {
    const { guess, gameId } = await request.json();
    
    if (!guess || typeof guess !== 'string' || guess.length !== 5) {
      return NextResponse.json({ error: 'Invalid guess' }, { status: 400 });
    }
    
    // For practice mode, we need the solution to be provided
    if (gameId && gameId.startsWith('practice-')) {
      const practiceWord = gameId.split('practice-')[1];
      if (!practiceWord) {
        return NextResponse.json({ error: 'Invalid practice game ID' }, { status: 400 });
      }
      
      const upperGuess = guess.toUpperCase();
      const upperSolution = practiceWord.toUpperCase();
      
      return NextResponse.json({
        result: checkGuess(upperGuess, upperSolution),
        isCorrect: upperGuess === upperSolution
      });
    }
    
    // For daily mode, use today's cached word
    const todaysWord = await getTodaysWordCached();
    const upperGuess = guess.toUpperCase();
    const upperSolution = todaysWord.toUpperCase();
    
    return NextResponse.json({
      result: checkGuess(upperGuess, upperSolution),
      isCorrect: upperGuess === upperSolution
    });
    
  } catch (error) {
    console.error('Error processing guess:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Check guess against solution and return result array
function checkGuess(guess: string, solution: string): ('correct' | 'present' | 'absent')[] {
  const result: ('correct' | 'present' | 'absent')[] = [];
  const solutionChars = solution.split('');
  const guessChars = guess.split('');
  
  // First pass: mark correct letters
  const correctPositions = new Set<number>();
  for (let i = 0; i < 5; i++) {
    if (guessChars[i] === solutionChars[i]) {
      result[i] = 'correct';
      correctPositions.add(i);
    }
  }
  
  // Second pass: mark present letters
  const availableLetters = new Map<string, number>();
  
  // Count available letters (excluding correct positions)
  for (let i = 0; i < 5; i++) {
    if (!correctPositions.has(i)) {
      const letter = solutionChars[i];
      availableLetters.set(letter, (availableLetters.get(letter) || 0) + 1);
    }
  }
  
  // Check for present letters
  for (let i = 0; i < 5; i++) {
    if (correctPositions.has(i)) continue; // Already marked as correct
    
    const letter = guessChars[i];
    const available = availableLetters.get(letter) || 0;
    
    if (available > 0) {
      result[i] = 'present';
      availableLetters.set(letter, available - 1);
    } else {
      result[i] = 'absent';
    }
  }
  
  return result;
}

export async function GET() {
  try {
    // Just return that the service is ready - don't expose the word
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    return NextResponse.json({ 
      ready: true, 
      date: dateKey 
    });
  } catch (error) {
    console.error('Error checking word service:', error);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 500 });
  }
}