import { useState, useEffect, useCallback, useRef } from 'react';
import { getRandomWord } from '../wrdl-words';
import { 
  validateGuessWithZK, 
  initializeZKGameState
} from '../../lib/zk-client-validator';

interface GameState {
  currentRow: number;
  currentCol: number;
  guesses: string[][];
  gameStatus: "playing" | "won" | "lost";
  solution: string;
  zkLetterStates?: Array<Array<{ letter: string; state: 'correct' | 'present' | 'absent' }>>; // For ZK mode
}

interface GameStats {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  maxStreak: number;
  guessDistribution: number[];
}

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

// Get today's date as a string for storage key (using UTC to match server)
const getTodayKey = (): string => {
  const today = new Date();
  return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
};

// Clear old daily state entries from localStorage
const clearOldDailyStates = (): void => {
  const today = getTodayKey();
  
  // Get all keys first, then filter and remove
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('wrdl-daily-zk-state-') && key !== `wrdl-daily-zk-state-${today}`) {
      localStorage.removeItem(key);
    }
  }
};

// Traditional mode removed - all daily games now use ZK proofs for security

// ZK-specific guess validation (now uses single API endpoint)

const validateZKGuess = async (
  guess: string, 
  zkProof: { commitment: string; merkleRoot: string; wordLength: number },
  salt: string,
  positionHashes: string[]
): Promise<{ isValid: boolean, letterStates?: unknown[], isWinner?: boolean }> => {
  if (!zkProof || !salt || !positionHashes) {
    throw new Error('No ZK proof, salt, or position hashes available');
  }
  
  try {
    // Initialize ZK game state
    const gameState = initializeZKGameState(
      zkProof,
      salt,
      new Date().toISOString().split('T')[0],
      positionHashes
    );
    
    // Validate guess client-side using ZK proofs
    const result = await validateGuessWithZK(guess, gameState);
    
    return {
      isValid: true,
      letterStates: result.letterStates,
      isWinner: result.isWinner
    };
  } catch (error) {
    console.error('ZK guess validation failed:', error);
    return { isValid: false };
  }
};

export function useWordleGame() {
  const [practiceMode, setPracticeMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wrdl-practice-mode');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [hardMode, setHardMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wrdl-hard-mode');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [lightningMode, setLightningMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wrdl-lightning-mode');
      return saved ? JSON.parse(saved) : true;
    }
    return true;
  });
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [justSwitchedMode, setJustSwitchedMode] = useState<boolean>(false);
  const [dailyModeAvailable, setDailyModeAvailable] = useState<boolean>(true);
  const [isLoadingDaily, setIsLoadingDaily] = useState<boolean>(false);
  const [zkProof, setZkProof] = useState<{ commitment: string; merkleRoot: string; wordLength: number } | null>(null);
  const [zkSalt, setZkSalt] = useState<string | null>(null);
  const [positionHashes, setPositionHashes] = useState<string[] | null>(null);
  const [daysSinceLaunch, setDaysSinceLaunch] = useState<number | null>(null);
  // All daily games now use ZK mode - no traditional mode option

  const [gameState, setGameState] = useState<GameState>({
    currentRow: 0,
    currentCol: 0,
    guesses: Array(MAX_GUESSES)
      .fill(null)
      .map(() => Array(WORD_LENGTH).fill("")),
    gameStatus: "playing",
    solution: "",
  });

  const [stats, setStats] = useState<GameStats>({
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    guessDistribution: [0, 0, 0, 0, 0, 0],
  });

  const [shakeRow, setShakeRow] = useState<number | null>(null);
  const [flipRow, setFlipRow] = useState<number | null>(null);
  const [keyboardUpdateRow, setKeyboardUpdateRow] = useState<number>(0);
  const [selectedCol, setSelectedCol] = useState<number>(0);
  const [prefillCells, setPrefillCells] = useState<Set<string>>(new Set());

  // Refs to track timeout IDs by key for cleanup
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Helper function to create keyed timeouts that clear previous ones
  const createTimeout = (key: string, callback: () => void, delay: number) => {
    // Clear previous timeout for this key if it exists
    const existingTimeout = timeoutRefs.current.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Create new timeout
    const timeoutId = setTimeout(() => {
      callback();
      timeoutRefs.current.delete(key);
    }, delay);

    timeoutRefs.current.set(key, timeoutId);
    return timeoutId;
  };

  // Cleanup function to clear all timeouts
  const clearAllTimeouts = () => {
    timeoutRefs.current.forEach((timeoutId) => clearTimeout(timeoutId));
    timeoutRefs.current.clear();
  };

  const getCellStatus = (row: number, col: number): string => {
    if (row > gameState.currentRow) return "empty";
    if (row === gameState.currentRow) return "current";

    // For daily mode, check if we have ZK letter states for this row
    if (!practiceMode && gameState.zkLetterStates && gameState.zkLetterStates[row]) {
      const letterState = gameState.zkLetterStates[row][col];
      if (letterState) {
        return letterState.state; // 'correct', 'present', or 'absent'
      }
    }

    // Fallback to traditional logic for practice mode
    const guess = gameState.guesses[row];
    const solution = gameState.solution;
    const letter = guess[col];

    // If no solution available (ZK mode without letter states), return empty
    if (!solution) return "empty";

    // First pass: mark all correct letters (green)
    const correctPositions = new Set<number>();
    for (let i = 0; i < 5; i++) {
      if (solution[i] === guess[i]) {
        correctPositions.add(i);
      }
    }

    // If this position is correct, return green
    if (solution[col] === letter) return "correct";

    // Second pass: mark present letters (yellow) considering frequency
    const solutionLetterCount = new Map<string, number>();
    const usedLetterCount = new Map<string, number>();

    // Count letters in solution (excluding already correct positions)
    for (let i = 0; i < 5; i++) {
      if (!correctPositions.has(i)) {
        const solutionLetter = solution[i];
        solutionLetterCount.set(
          solutionLetter,
          (solutionLetterCount.get(solutionLetter) || 0) + 1
        );
      }
    }

    // Check positions left to right for present letters
    for (let i = 0; i < 5; i++) {
      const guessLetter = guess[i];

      // Skip if this position is already correct
      if (correctPositions.has(i)) continue;

      // Check if this letter exists in remaining solution letters
      const availableCount = solutionLetterCount.get(guessLetter) || 0;
      const usedCount = usedLetterCount.get(guessLetter) || 0;

      if (availableCount > usedCount) {
        usedLetterCount.set(guessLetter, usedCount + 1);
        // If we're checking this specific position, return present
        if (i === col) return "present";
      }
    }

    return "absent";
  };

  const getKeyStatus = (key: string): string => {
    if (key.length > 1) return ""; // Skip ENTER and BACKSPACE

    let status = "";

    // Use keyboardUpdateRow instead of gameState.currentRow for keyboard coloring
    for (let row = 0; row < keyboardUpdateRow; row++) {
      // For daily mode, check ZK letter states first
      if (!practiceMode && gameState.zkLetterStates && gameState.zkLetterStates[row]) {
        for (let col = 0; col < WORD_LENGTH; col++) {
          const letterState = gameState.zkLetterStates[row][col];
          if (letterState && letterState.letter === key) {
            // Prioritize: correct > present > absent
            if (letterState.state === "correct") {
              return "correct";
            } else if (letterState.state === "present" && status !== "correct") {
              status = "present";
            } else if (letterState.state === "absent" && status === "") {
              status = "absent";
            }
          }
        }
      } else {
        // Fallback to traditional logic
        for (let col = 0; col < WORD_LENGTH; col++) {
          const letter = gameState.guesses[row][col];
          if (letter === key) {
            const cellStatus = getCellStatus(row, col);
            // Prioritize: correct > present > absent
            if (cellStatus === "correct") {
              return "correct";
            } else if (cellStatus === "present" && status !== "correct") {
              status = "present";
            } else if (cellStatus === "absent" && status === "") {
              status = "absent";
            }
          }
        }
      }
    }

    return status;
  };


  const updateStats = useCallback(
    (guessCount: number) => {
      const newStats = { ...stats };
      newStats.gamesPlayed++;

      if (guessCount > 0) {
        newStats.gamesWon++;
        newStats.currentStreak++;
        newStats.maxStreak = Math.max(
          newStats.maxStreak,
          newStats.currentStreak
        );
        newStats.guessDistribution[guessCount - 1]++;
      } else {
        newStats.currentStreak = 0;
      }

      setStats(newStats);
      // Save stats with mode-specific key
      const statsKey = practiceMode ? "wrdl-stats-practice" : "wrdl-stats-daily";
      localStorage.setItem(statsKey, JSON.stringify(newStats));
    },
    [stats, practiceMode]
  );

  const resetGame = async () => {
    if (practiceMode) {
      // Practice mode: new random word
      setGameState({
        currentRow: 0,
        currentCol: 0,
        guesses: Array(MAX_GUESSES)
          .fill(null)
          .map(() => Array(WORD_LENGTH).fill("")),
        gameStatus: "playing",
        solution: getRandomWord(),
      });
    } else {
      // Daily mode: clear old daily states and check for new word
      clearOldDailyStates();
      
      const today = getTodayKey();
      const savedState = localStorage.getItem(`wrdl-daily-zk-state-${today}`);
      
      if (!savedState) {
        // No saved state for today, fetch new word of the day
        try {
          const response = await fetch('/api/word-of-day');
          if (response.ok) {
            const data = await response.json();
            setZkProof(data.zkProof);
            setZkSalt(data.salt);
            setPositionHashes(data.positionHashes);
            setDaysSinceLaunch(data.daysSinceLaunch);
          }
        } catch (error) {
          console.error('Failed to fetch new word of day:', error);
        }
      }
      
      // Reset game state
      setGameState({
        currentRow: 0,
        currentCol: 0,
        guesses: Array(MAX_GUESSES)
          .fill(null)
          .map(() => Array(WORD_LENGTH).fill("")),
        gameStatus: "playing",
        solution: "", // Empty for ZK mode
      });
    }
    
    setShakeRow(null);
    setFlipRow(null);
    setKeyboardUpdateRow(0);
    setSelectedCol(0);
    setPrefillCells(new Set());
  };

  // Handle practice mode changes
  useEffect(() => {
    localStorage.setItem('wrdl-practice-mode', JSON.stringify(practiceMode));
  }, [practiceMode]);

  // Handle hard mode changes
  useEffect(() => {
    localStorage.setItem('wrdl-hard-mode', JSON.stringify(hardMode));
  }, [hardMode]);

  // Handle lightning mode changes
  useEffect(() => {
    localStorage.setItem('wrdl-lightning-mode', JSON.stringify(lightningMode));
  }, [lightningMode]);

  // Load appropriate stats when mode changes
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;
    
    const statsKey = practiceMode ? "wrdl-stats-practice" : "wrdl-stats-daily";
    const saved = localStorage.getItem(statsKey);
    if (saved) {
      setStats(JSON.parse(saved));
    } else {
      // Initialize with default stats if none exist for this mode
      setStats({
        gamesPlayed: 0,
        gamesWon: 0,
        currentStreak: 0,
        maxStreak: 0,
        guessDistribution: [0, 0, 0, 0, 0, 0],
      });
    }
  }, [practiceMode, isInitialized]);

  // Handle switching between practice and daily mode
  useEffect(() => {
    // Skip if not initialized yet or on server
    if (!isInitialized || typeof window === 'undefined') return;
    
    const today = getTodayKey();
    
    // Always reset UI state when switching modes
    setShakeRow(null);
    setFlipRow(null);
    setSelectedCol(0);
    setPrefillCells(new Set());
    
    if (practiceMode) {
      // Switching to practice mode - load practice state or start fresh
      const savedPracticeState = localStorage.getItem('wrdl-practice-state');
      if (savedPracticeState) {
        const loadedState = JSON.parse(savedPracticeState);
        setGameState(loadedState);
        setKeyboardUpdateRow(loadedState.currentRow);
      } else {
        setGameState({
          currentRow: 0,
          currentCol: 0,
          guesses: Array(MAX_GUESSES)
            .fill(null)
            .map(() => Array(WORD_LENGTH).fill("")),
          gameStatus: "playing",
          solution: getRandomWord(),
        });
        setKeyboardUpdateRow(0);
      }
    } else {
      // Switching to daily mode - load ZK saved state (all daily games use ZK)
      const savedDailyState = localStorage.getItem(`wrdl-daily-zk-state-${today}`);
      
      if (savedDailyState) {
        const loadedState = JSON.parse(savedDailyState);
        setGameState(loadedState);
        setKeyboardUpdateRow(loadedState.currentRow);
      } else {
        // New daily game - solution will be loaded by another useEffect
        setGameState({
          currentRow: 0,
          currentCol: 0,
          guesses: Array(MAX_GUESSES)
            .fill(null)
            .map(() => Array(WORD_LENGTH).fill("")),
          gameStatus: "playing",
          solution: "",
        });
        setKeyboardUpdateRow(0);
      }
    }
  }, [practiceMode, isInitialized]);


  // Save game state based on current mode
  useEffect(() => {
    // Skip saving during initialization or right after mode switch
    if (!isInitialized || justSwitchedMode) {
      if (justSwitchedMode) {
        setJustSwitchedMode(false);
      }
      return;
    }
    
    if (practiceMode) {
      // Save practice state (solution should always exist in practice mode)
      if (gameState.solution !== "") {
        localStorage.setItem('wrdl-practice-state', JSON.stringify(gameState));
      }
    } else {
      // Save daily state (always ZK mode - save without solution but with ZK letter states)
      const today = getTodayKey();
      const zkSafeState = {
        ...gameState,
        solution: "", // Remove solution for security
        zkLetterStates: gameState.zkLetterStates // Keep ZK results for display
      };
      localStorage.setItem(`wrdl-daily-zk-state-${today}`, JSON.stringify(zkSafeState));
    }
  }, [practiceMode, gameState, isInitialized, justSwitchedMode]);

  // Check word availability first, then initialize
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const initializeApp = async () => {
        // Clear old daily state entries from previous days
        clearOldDailyStates();
        
        // Initialize stats based on initial mode
        const statsKey = practiceMode ? "wrdl-stats-practice" : "wrdl-stats-daily";
        const saved = localStorage.getItem(statsKey);
        if (saved) {
          setStats(JSON.parse(saved));
        } else {
          // Initialize with default stats if none exist
          setStats({
            gamesPlayed: 0,
            gamesWon: 0,
            currentStreak: 0,
            maxStreak: 0,
            guessDistribution: [0, 0, 0, 0, 0, 0],
          });
        }
        
        const today = getTodayKey();
        let shouldUsePracticeMode = practiceMode;
        
        // If not in practice mode, get ZK proof for daily mode
        if (!practiceMode) {
          setIsLoadingDaily(true);
          try {
            // Get ZK proof from word-of-day API
            const response = await fetch('/api/word-of-day');
            if (!response.ok) {
              throw new Error('Failed to fetch word of day');
            }
            const data = await response.json();
            
            setZkProof(data.zkProof);
            setZkSalt(data.salt);
            setPositionHashes(data.positionHashes);
            setDaysSinceLaunch(data.daysSinceLaunch);
            setDailyModeAvailable(true);
          } catch (error) {
            console.error('Daily word unavailable, forcing practice mode:', error);
            setDailyModeAvailable(false);
            shouldUsePracticeMode = true;
            setPracticeMode(true);
          }
          setIsLoadingDaily(false);
        }
        
        // Initialize game state based on final mode
        if (shouldUsePracticeMode) {
          // Practice mode: check for saved practice state
          const savedPracticeState = localStorage.getItem('wrdl-practice-state');
          if (savedPracticeState) {
            const loadedState = JSON.parse(savedPracticeState);
            setGameState(loadedState);
            setKeyboardUpdateRow(loadedState.currentRow);
          } else {
            // No saved practice state, start fresh
            setGameState({
              currentRow: 0,
              currentCol: 0,
              guesses: Array(MAX_GUESSES)
                .fill(null)
                .map(() => Array(WORD_LENGTH).fill("")),
              gameStatus: "playing",
              solution: getRandomWord(),
            });
          }
        } else {
          // Daily mode: check for saved ZK state for today first (before creating new game)
          const zkStateKey = `wrdl-daily-zk-state-${today}`;
          const savedState = localStorage.getItem(zkStateKey);
          
          if (savedState) {
            const loadedState = JSON.parse(savedState);
            setGameState(loadedState);
            setKeyboardUpdateRow(loadedState.currentRow);
            
            // For ZK mode, we still need the proof and daysSinceLaunch even with saved state
            if (!zkProof || !zkSalt || !daysSinceLaunch) {
              try {
                const response = await fetch('/api/word-of-day');
                if (response.ok) {
                  const data = await response.json();
                  setZkProof(data.zkProof);
                  setZkSalt(data.salt);
                  setPositionHashes(data.positionHashes);
                  setDaysSinceLaunch(data.daysSinceLaunch);
                }
              } catch (error) {
                console.error('Failed to get ZK proof for loaded state:', error);
              }
            }
            
            // Skip new game creation since we loaded existing state
            setIsInitialized(true);
            return;
          } else {
            // New daily game - ZK mode only (no solution stored locally)
            const newGameState = {
              currentRow: 0,
              currentCol: 0,
              guesses: Array(MAX_GUESSES)
                .fill(null)
                .map(() => Array(WORD_LENGTH).fill("")),
              gameStatus: "playing" as const,
              solution: "", // Empty - real validation happens via ZK
            };
            setGameState(newGameState);
            setKeyboardUpdateRow(0);
          }
        }
        
        setIsInitialized(true);
      };
      
      initializeApp();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup all timeouts on component unmount
  useEffect(() => {
    return () => {
      clearAllTimeouts();
    };
  }, []);

  const togglePracticeMode = useCallback(() => {
    // Save current state before switching
    const today = getTodayKey();
    
    if (practiceMode) {
      // Currently in practice mode, save practice state
      localStorage.setItem('wrdl-practice-state', JSON.stringify(gameState));
    } else {
      // Currently in daily mode, save daily state (always ZK mode)
      const zkSafeState = {
        ...gameState,
        solution: "",
        zkLetterStates: gameState.zkLetterStates
      };
      localStorage.setItem(`wrdl-daily-zk-state-${today}`, JSON.stringify(zkSafeState));
    }
    
    // Add a small delay to ensure save completes, then toggle
    setTimeout(() => {
      setJustSwitchedMode(true);
      setPracticeMode(!practiceMode);
    }, 10);
  }, [practiceMode, gameState]);

  const toggleHardMode = useCallback(() => {
    setHardMode(!hardMode);
  }, [hardMode]);

  const toggleLightningMode = useCallback(() => {
    if (!hardMode) {
      setLightningMode(!lightningMode);
    }
  }, [hardMode, lightningMode]);

  // Hard mode forces lightning mode
  const isLightningModeActive = useCallback(() => {
    return hardMode ? true : lightningMode;
  }, [hardMode, lightningMode]);

  return {
    // State
    practiceMode,
    hardMode,
    lightningMode,
    gameState,
    stats,
    shakeRow,
    flipRow,
    keyboardUpdateRow,
    selectedCol,
    prefillCells,
    dailyModeAvailable,
    isInitialized,
    isLoadingDaily,
    zkProof,
    zkSalt,
    positionHashes,
    daysSinceLaunch,
    
    // Actions
    setPracticeMode,
    togglePracticeMode,
    setHardMode,
    toggleHardMode,
    setLightningMode,
    toggleLightningMode,
    setGameState,
    setShakeRow,
    setFlipRow,
    setKeyboardUpdateRow,
    setSelectedCol,
    setPrefillCells,
    resetGame,
    updateStats,
    createTimeout,
    
    // Helpers
    getCellStatus,
    getKeyStatus,
    isLightningModeActive,
    validateZKGuess: (guess: string) => zkProof && zkSalt && positionHashes ? validateZKGuess(guess, zkProof, zkSalt, positionHashes) : Promise.resolve({ isValid: false, letterStates: [], isWinner: false }),
  };
}