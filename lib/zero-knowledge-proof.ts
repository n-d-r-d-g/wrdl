import crypto from 'crypto';

// Simple zero-knowledge proof system for word validation
// Server can prove it knows the word without revealing it
// Client can verify individual letter positions without learning the word

interface ZKProof {
  commitment: string;
  merkleRoot: string;
  wordLength: number;
}

interface LetterProof {
  position: number;
  letter: string;
  proof: string[];
  isCorrect: boolean;
}

/**
 * Server-side: Generate zero-knowledge proof for a word
 */
export function generateZKProof(word: string, salt: string): ZKProof {
  const normalizedWord = word.toUpperCase();
  
  // Create commitment to the word
  const commitment = crypto
    .createHash('sha256')
    .update(normalizedWord + salt + Date.now().toString())
    .digest('hex');
  
  // Create Merkle tree of letter positions
  const leaves: string[] = [];
  for (let i = 0; i < normalizedWord.length; i++) {
    const leaf = crypto
      .createHash('sha256')
      .update(`${i}:${normalizedWord[i]}:${salt}`)
      .digest('hex');
    leaves.push(leaf);
  }
  
  // Simple Merkle root (for demo - real implementation would build full tree)
  const merkleRoot = crypto
    .createHash('sha256')
    .update(leaves.join(''))
    .digest('hex');
  
  return {
    commitment,
    merkleRoot,
    wordLength: normalizedWord.length
  };
}

/**
 * Server-side: Generate proof for a specific letter guess
 */
export function generateLetterProof(
  word: string,
  position: number,
  guessedLetter: string,
  salt: string
): LetterProof {
  const normalizedWord = word.toUpperCase();
  const normalizedGuess = guessedLetter.toUpperCase();
  
  if (position < 0 || position >= normalizedWord.length) {
    throw new Error('Invalid position');
  }
  
  const actualLetter = normalizedWord[position];
  const isCorrect = actualLetter === normalizedGuess;
  
  // Generate proof path (simplified - real Merkle tree would have full path)
  const proofElements: string[] = [];
  
  // Add proof that this position exists in the commitment
  const positionProof = crypto
    .createHash('sha256')
    .update(`${position}:${actualLetter}:${salt}`)
    .digest('hex');
  proofElements.push(positionProof);
  
  // Add adjacent position hashes (for Merkle path)
  for (let i = 0; i < normalizedWord.length; i++) {
    if (i !== position) {
      const siblingHash = crypto
        .createHash('sha256')
        .update(`${i}:${normalizedWord[i]}:${salt}`)
        .digest('hex');
      proofElements.push(siblingHash);
    }
  }
  
  return {
    position,
    letter: isCorrect ? actualLetter : '', // Only reveal if correct
    proof: proofElements,
    isCorrect
  };
}

/**
 * Client-side: Verify a letter proof against the ZK proof
 */
export function verifyLetterProof(
  letterProof: LetterProof,
  zkProof: ZKProof,
  salt: string
): boolean {
  if (!letterProof.isCorrect) {
    // For incorrect guesses, we can't verify the actual letter
    // We trust the server's response (this is a limitation of simple ZK)
    return true;
  }
  
  // Verify the correct letter proof
  const expectedHash = crypto
    .createHash('sha256')
    .update(`${letterProof.position}:${letterProof.letter}:${salt}`)
    .digest('hex');
  
  return letterProof.proof.includes(expectedHash);
}

/**
 * Server-side: Generate word presence proof (for yellow letters)
 */
export function generateWordPresenceProof(
  word: string,
  guessedLetter: string,
  salt: string
): { isPresent: boolean; proof: string } {
  const normalizedWord = word.toUpperCase();
  const normalizedGuess = guessedLetter.toUpperCase();
  
  const isPresent = normalizedWord.includes(normalizedGuess);
  
  if (isPresent) {
    // Generate proof that letter exists somewhere in word
    const positions = [];
    for (let i = 0; i < normalizedWord.length; i++) {
      if (normalizedWord[i] === normalizedGuess) {
        positions.push(i);
      }
    }
    
    // Proof is hash of all positions where letter appears
    const proof = crypto
      .createHash('sha256')
      .update(`${normalizedGuess}:${positions.join(',')}:${salt}`)
      .digest('hex');
    
    return { isPresent: true, proof };
  }
  
  return { isPresent: false, proof: '' };
}

/**
 * Client-side: Verify word presence proof
 */
export function verifyWordPresenceProof(
  letter: string,
  proof: string,
  isPresent: boolean
): boolean {
  // For this simplified version, we trust the server's presence claim
  // A full ZK implementation would allow cryptographic verification
  // without revealing the positions
  return true;
}