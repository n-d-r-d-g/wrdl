'use client'

import { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { useWordleGame } from '../src/hooks/useWordleGame'
import { isValidWrdlWord } from '../src/wrdl-words'
import { Share2, Eye, EyeOff, Sun, Moon, Monitor, Zap, ZapOff, Gamepad2, WholeWord } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

export default function Home() {
  // Use the custom hook for all game logic
  const {
    practiceMode,
    gameState,
    shakeRow,
    flipRow,
    selectedCol,
    prefillCells,
    dailyModeAvailable,
    isInitialized,
    isLoadingDaily,
    zkSession,
    useZKMode,
    togglePracticeMode,
    setGameState,
    setShakeRow,
    setFlipRow,
    setKeyboardUpdateRow,
    setSelectedCol,
    setPrefillCells,
    resetGame,
    updateStats,
    createTimeout,
    getCellStatus,
    getKeyStatus,
    validateZKGuess,
  } = useWordleGame();

  // App-specific state (not game logic)
  const [themePreference, setThemePreference] = useState<'light' | 'dark' | 'system'>('system')
  const [showGameOver, setShowGameOver] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [privacyMode, setPrivacyMode] = useState(false)
  const [lightningMode, setLightningMode] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Initialize state from localStorage on client-side only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('wrdl-theme')
      setThemePreference((savedTheme as 'light' | 'dark' | 'system') || 'system')
      
      const saved = localStorage.getItem('wrdl-lightning-mode')
      setLightningMode(saved ? JSON.parse(saved) : true)
      
      setMounted(true)
    }
  }, [])

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    createTimeout("toast", () => setToastMessage(null), 2000);
  }, []);

  const handleZKGuess = useCallback(async (guess: string) => {
    try {
      const result = await validateZKGuess(guess);
      
      if (!result.isValid) {
        showToast("Validation failed");
        setShakeRow(gameState.currentRow);
        createTimeout("shake", () => setShakeRow(null), 500);
        return;
      }

      // Update game state with ZK results
      const newGameState = { ...gameState };
      
      // Store ZK letter states for this row
      if (!newGameState.zkLetterStates) {
        newGameState.zkLetterStates = [];
      }
      newGameState.zkLetterStates[gameState.currentRow] = (result.letterStates as { letter: string; state: "correct" | "present" | "absent" }[]) || [];
      
      newGameState.currentRow++;
      newGameState.currentCol = 0;
      

      if (result.isWinner) {
        newGameState.gameStatus = "won";
        // Update solution with the actual word if revealed
        if (result.letterStates) {
          const revealedWord = (result.letterStates as { letter: string; state: "correct" | "present" | "absent" }[])
            .filter(ls => ls.state === 'correct')
            .map(ls => ls.letter)
            .join('');
          if (revealedWord.length === WORD_LENGTH) {
            newGameState.solution = revealedWord;
          }
        }
      } else if (gameState.currentRow === MAX_GUESSES - 1) {
        newGameState.gameStatus = "lost";
      }

      setGameState(newGameState);
      setSelectedCol(0);

      // Trigger flip animation
      setFlipRow(gameState.currentRow);
      createTimeout(
        "flip",
        () => {
          setFlipRow(null);
          setKeyboardUpdateRow(newGameState.currentRow);
          
          // Lightning Mode: prefill correct letters after flip animation
          if (lightningMode && !result.isWinner && newGameState.currentRow < MAX_GUESSES) {
            const nextRowGuesses = [...newGameState.guesses];
            const newPrefillCells = new Set<string>();
            
            // ZK mode: use zkLetterStates to find correct letters
            const lastRowStates = newGameState.zkLetterStates?.[newGameState.currentRow - 1];
            if (lastRowStates) {
              for (let col = 0; col < WORD_LENGTH; col++) {
                const letterState = lastRowStates[col];
                if (letterState && letterState.state === 'correct') {
                  nextRowGuesses[newGameState.currentRow][col] = letterState.letter;
                  newPrefillCells.add(`${newGameState.currentRow}-${col}`);
                }
              }
            }
            
            // Find first empty cell for selection
            let firstEmptyCol = 0;
            for (let i = 0; i < WORD_LENGTH; i++) {
              if (nextRowGuesses[newGameState.currentRow][i] === "") {
                firstEmptyCol = i;
                break;
              }
            }
            
            // Update currentCol to reflect the rightmost non-empty cell + 1
            let newCurrentCol = 0;
            for (let i = 0; i < WORD_LENGTH; i++) {
              if (nextRowGuesses[newGameState.currentRow][i] !== "") {
                newCurrentCol = i + 1;
              }
            }
            
            setGameState(prev => ({...prev, guesses: nextRowGuesses, currentCol: newCurrentCol}));
            setSelectedCol(firstEmptyCol);
            setPrefillCells(newPrefillCells);
            
            // Remove prefill animation after delay
            createTimeout("prefill", () => setPrefillCells(new Set()), 800);
          }
        },
        1600
      );

      // Update stats and show game over modal if game ended
      if (result.isWinner || gameState.currentRow === MAX_GUESSES - 1) {
        createTimeout(
          "stats",
          () => {
            updateStats(result.isWinner ? gameState.currentRow + 1 : 0);
            createTimeout("gameOver", () => setShowGameOver(true), 500);
          },
          1200
        );
      }

    } catch (error) {
      console.error('Guess validation failed:', error);
      showToast("Network error");
      setShakeRow(gameState.currentRow);
      createTimeout("shake", () => setShakeRow(null), 500);
    }
  }, [gameState, validateZKGuess, showToast, setShakeRow, createTimeout, setGameState, setSelectedCol, setFlipRow, setKeyboardUpdateRow, updateStats]);

  const handleKeyPress = useCallback(
    (key: string) => {
      if (gameState.gameStatus !== "playing") return;
      if (flipRow !== null) return; // Block input during flip animation

      if (key === "ENTER") {
        if (gameState.currentCol !== WORD_LENGTH) return;

        const currentGuess = gameState.guesses[gameState.currentRow].join("");

        // Validate word length
        if (currentGuess.length !== WORD_LENGTH) return;

        // Check if word is in the word list
        if (!isValidWrdlWord(currentGuess)) {
          showToast("Not in word list");
          setShakeRow(gameState.currentRow);
          createTimeout("shake", () => setShakeRow(null), 500);
          return;
        }

        // Check if word has already been guessed
        const previousGuesses = gameState.guesses
          .slice(0, gameState.currentRow)
          .map((row) => row.join(""));
        if (previousGuesses.includes(currentGuess)) {
          showToast("Already guessed");
          setShakeRow(gameState.currentRow);
          createTimeout("shake", () => setShakeRow(null), 500);
          return;
        }

        // Handle ZK validation for daily mode
        if (!practiceMode && useZKMode && zkSession) {
          handleZKGuess(currentGuess);
          return;
        }

        // Traditional validation for practice mode or non-ZK daily mode
        const newGameState = { ...gameState };

        if (currentGuess === gameState.solution) {
          newGameState.gameStatus = "won";
        } else if (gameState.currentRow === MAX_GUESSES - 1) {
          newGameState.gameStatus = "lost";
        }

        newGameState.currentRow++;
        newGameState.currentCol = 0;

        setGameState(newGameState);
        setSelectedCol(0);

        // Trigger flip animation
        setFlipRow(gameState.currentRow);
        createTimeout(
          "flip",
          () => {
            setFlipRow(null);
            setKeyboardUpdateRow(newGameState.currentRow); // Update keyboard colors after animation
            
            // Lightning Mode: prefill correct letters after flip animation
            if (lightningMode && newGameState.currentRow < MAX_GUESSES) {
              const nextRowGuesses = [...newGameState.guesses];
              const newPrefillCells = new Set<string>();
              
              // Check each position for correct letters and prefill them
              if (!practiceMode && useZKMode && newGameState.zkLetterStates) {
                // ZK mode: use zkLetterStates to find correct letters
                const lastRowStates = newGameState.zkLetterStates[newGameState.currentRow - 1];
                if (lastRowStates) {
                  for (let col = 0; col < WORD_LENGTH; col++) {
                    const letterState = lastRowStates[col];
                    if (letterState && letterState.state === 'correct') {
                      nextRowGuesses[newGameState.currentRow][col] = letterState.letter;
                      newPrefillCells.add(`${newGameState.currentRow}-${col}`);
                    }
                  }
                }
              } else {
                // Traditional mode: compare with solution
                if (gameState.solution && currentGuess !== gameState.solution) {
                  for (let col = 0; col < WORD_LENGTH; col++) {
                    if (gameState.solution[col] === currentGuess[col]) {
                      nextRowGuesses[newGameState.currentRow][col] = currentGuess[col];
                      newPrefillCells.add(`${newGameState.currentRow}-${col}`);
                    }
                  }
                }
              }
              
              // Find first empty cell for selection
              let firstEmptyCol = 0;
              for (let i = 0; i < WORD_LENGTH; i++) {
                if (nextRowGuesses[newGameState.currentRow][i] === "") {
                  firstEmptyCol = i;
                  break;
                }
              }
              
              // Update currentCol to reflect the rightmost non-empty cell + 1
              let newCurrentCol = 0;
              for (let i = 0; i < WORD_LENGTH; i++) {
                if (nextRowGuesses[newGameState.currentRow][i] !== "") {
                  newCurrentCol = i + 1;
                }
              }
              
              setGameState(prev => ({...prev, guesses: nextRowGuesses, currentCol: newCurrentCol}));
              setSelectedCol(firstEmptyCol);
              setPrefillCells(newPrefillCells);
              
              // Remove prefill animation after delay
              createTimeout("prefill", () => setPrefillCells(new Set()), 800);
            }
          },
          1600
        );

        // Update stats and show game over modal after animation
        if (
          currentGuess === gameState.solution ||
          gameState.currentRow === MAX_GUESSES - 1
        ) {
          createTimeout(
            "stats",
            () => {
              updateStats(
                currentGuess === gameState.solution
                  ? gameState.currentRow + 1
                  : 0
              );
              createTimeout("gameOver", () => setShowGameOver(true), 500);
            },
            1200
          );
        }
      } else if (key === "BACKSPACE") {
        const newGuesses = [...gameState.guesses];
        const hadLetter = newGuesses[gameState.currentRow][selectedCol] !== "";

        if (hadLetter) {
          // Delete letter at current position and stay there
          newGuesses[gameState.currentRow][selectedCol] = "";
        } else if (selectedCol > 0) {
          // Current cell is empty, delete previous cell and move selection there
          newGuesses[gameState.currentRow][selectedCol - 1] = "";
          setSelectedCol(selectedCol - 1);
        }

        // Update currentCol to reflect the rightmost non-empty cell + 1
        const currentRowGuess = newGuesses[gameState.currentRow];
        let newCurrentCol = 0;
        for (let i = 0; i < WORD_LENGTH; i++) {
          if (currentRowGuess[i] !== "") {
            newCurrentCol = i + 1;
          }
        }

        setGameState({
          ...gameState,
          guesses: newGuesses,
          currentCol: newCurrentCol,
        });
      } else if (key === "DELETE") {
        const newGuesses = [...gameState.guesses];
        const hadLetter = newGuesses[gameState.currentRow][selectedCol] !== "";

        if (hadLetter) {
          // Delete letter at current position and stay there
          newGuesses[gameState.currentRow][selectedCol] = "";
        } else if (selectedCol < 4) {
          // Current cell is empty, delete previous cell and move selection there
          newGuesses[gameState.currentRow][selectedCol + 1] = "";
          setSelectedCol(selectedCol + 1);
        }

        // Update currentCol to reflect the rightmost non-empty cell + 1
        const currentRowGuess = newGuesses[gameState.currentRow];
        let newCurrentCol = 0;
        for (let i = 0; i < WORD_LENGTH; i++) {
          if (currentRowGuess[i] !== "") {
            newCurrentCol = i + 1;
          }
        }

        setGameState({
          ...gameState,
          guesses: newGuesses,
          currentCol: newCurrentCol,
        });
      } else if (key.match(/^[A-Z]$/)) {
        const newGuesses = [...gameState.guesses];
        newGuesses[gameState.currentRow][selectedCol] = key;

        // Update currentCol to reflect the rightmost non-empty cell + 1
        const currentRowGuess = newGuesses[gameState.currentRow];
        let newCurrentCol = 0;
        for (let i = 0; i < WORD_LENGTH; i++) {
          if (currentRowGuess[i] !== "") {
            newCurrentCol = i + 1;
          }
        }

        setGameState({
          ...gameState,
          guesses: newGuesses,
          currentCol: newCurrentCol,
        });

        // Move selection to the right after entering a letter, only if row isn't full
        const isRowFull = currentRowGuess.every((cell) => cell !== "");
        if (!isRowFull && selectedCol < WORD_LENGTH - 1) {
          setSelectedCol((prev) => Math.min(WORD_LENGTH - 1, prev + 1));
        }
      }
    },
    [gameState, updateStats, flipRow, selectedCol, showToast, lightningMode, togglePracticeMode]
  );

  const generateShareText = () => {
    const guessCount =
      gameState.gameStatus === "won" ? gameState.currentRow : "X";
    const modeText = practiceMode ? "(Practice)" : "(Daily)";
    let shareText = `Wrdl ${guessCount}/6 ${modeText}\n\n`;

    // Generate grid for completed rows only
    const completedRows =
      gameState.gameStatus === "won" ? gameState.currentRow : MAX_GUESSES;

    for (let row = 0; row < completedRows; row++) {
      let rowText = "";
      for (let col = 0; col < 5; col++) {
        const letter = gameState.guesses[row][col];
        const solution = gameState.solution;

        if (solution[col] === letter) {
          rowText += "🟩"; // Green square for correct
        } else if (solution.includes(letter)) {
          // Check if this should be yellow (same logic as getCellStatus)
          const guess = gameState.guesses[row];
          const correctPositions = new Set();

          // Mark correct positions
          for (let i = 0; i < 5; i++) {
            if (solution[i] === guess[i]) {
              correctPositions.add(i);
            }
          }

          // Count available letters
          const solutionLetterCount = new Map();
          const usedLetterCount = new Map();

          for (let i = 0; i < 5; i++) {
            if (!correctPositions.has(i)) {
              const solutionLetter = solution[i];
              solutionLetterCount.set(
                solutionLetter,
                (solutionLetterCount.get(solutionLetter) || 0) + 1
              );
            }
          }

          // Check if this position should be yellow
          let isPresent = false;
          for (let i = 0; i < 5; i++) {
            const guessLetter = guess[i];
            if (correctPositions.has(i)) continue;

            const availableCount = solutionLetterCount.get(guessLetter) || 0;
            const usedCount = usedLetterCount.get(guessLetter) || 0;

            if (availableCount > usedCount) {
              usedLetterCount.set(guessLetter, usedCount + 1);
              if (i === col) isPresent = true;
            }
          }

          rowText += isPresent ? "🟨" : "⬛"; // Yellow for present, black for absent
        } else {
          rowText += "⬛"; // Black square for absent
        }
      }
      shareText += rowText + "\n";
    }

    return shareText.trim();
  };

  const handleShare = () => {
    const shareText = generateShareText();

    try {
      const textarea = document.createElement("textarea");
      textarea.value = shareText;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setToastMessage("Results copied to clipboard!");
      createTimeout("shareToast", () => setToastMessage(""), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      setToastMessage("Unable to copy results. Try again.");
      createTimeout("shareToast", () => setToastMessage(""), 2000);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key presses when modifier keys are held
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
        return;
      }

      if (e.key === "Enter") {
        handleKeyPress("ENTER");
      } else if (e.key === "Backspace") {
        handleKeyPress("BACKSPACE");
      } else if (e.key === "Delete") {
        handleKeyPress("DELETE");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedCol((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedCol((prev) => Math.min(4, prev + 1));
      } else if (e.key.match(/^[a-zA-Z]$/)) {
        handleKeyPress(e.key.toUpperCase());
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyPress, togglePracticeMode]);

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", themePreference);
  }, [themePreference]);

  useEffect(() => {
    localStorage.setItem("wrdl-theme", themePreference);
  }, [themePreference]);

  // Show loading screen until app is initialized
  if (!isInitialized) {
    return (
      <div className="app">
        <h1>wrdl</h1>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '50vh',
          gap: '1rem'
        }}>
          {isLoadingDaily ? (
            <>
              <div style={{ fontSize: '1.2rem' }}>
                Loading word of the day...
              </div>
              <div className="loading-spinner"></div>
            </>
          ) : (
            <div style={{ fontSize: '1.2rem' }}>Initializing game...</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-controls">
          <button
            onClick={(e) => {
              setShowGameOver(true);
              // Only blur if clicked with mouse (button 0), not keyboard
              if (e.detail > 0) e.currentTarget.blur();
            }}
            className="share-button"
            disabled={gameState.gameStatus === "playing"}
            title="Share results"
          >
            <Share2 size={20} />
          </button>
          <button
            onClick={(e) => {
              if (dailyModeAvailable) {
                togglePracticeMode();
                setShowGameOver(false);
              }
              if (e.detail > 0) e.currentTarget.blur();
            }}
            className="practice-toggle"
            disabled={!dailyModeAvailable}
            title={
              !dailyModeAvailable 
                ? "Daily mode temporarily unavailable - only practice mode available"
                : mounted 
                  ? (practiceMode ? "Enable Word of the Day" : "Enable Practice Mode") 
                  : "Enable Practice Mode"
            }
            style={{
              opacity: !dailyModeAvailable ? 0.5 : 1,
              cursor: !dailyModeAvailable ? 'not-allowed' : 'pointer'
            }}
          >
            {mounted ? (practiceMode ? <Gamepad2 size={20} /> : <WholeWord size={20} />) : <WholeWord size={20} />}
          </button>
          <button
            onClick={(e) => {
              setLightningMode((prev: boolean) => {
                const newMode = !prev
                localStorage.setItem('wrdl-lightning-mode', String(newMode))
                return newMode
              })
              if (e.detail > 0) e.currentTarget.blur();
            }}
            className="lightning-toggle"
            title={lightningMode ? "Disable Lightning Mode" : "Enable Lightning Mode"}
          >
            {lightningMode ? <Zap size={20} /> : <ZapOff size={20} />}
          </button>
          <button
            onClick={(e) => {
              setPrivacyMode(!privacyMode);
              if (e.detail > 0) e.currentTarget.blur();
            }}
            className="privacy-toggle"
            title={privacyMode ? "Show game board" : "Hide game board"}
          >
            {privacyMode ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
          <button
            onClick={(e) => {
              setThemePreference(
                themePreference === "system"
                  ? "dark"
                  : themePreference === "dark"
                  ? "light"
                  : "system"
              );
              if (e.detail > 0) e.currentTarget.blur();
            }}
            className="dark-mode-toggle"
            title={`Switch to ${
              themePreference === "system"
                ? "dark"
                : themePreference === "dark"
                ? "light"
                : "system"
            } theme`}
          >
            {themePreference === "system" ? (
              <Monitor size={20} />
            ) : themePreference === "dark" ? (
              <Moon size={20} />
            ) : (
              <Sun size={20} />
            )}
          </button>
        </div>
      </header>

      <h1>wrdl</h1>

      <main className="main">
        <div className={`game-board ${privacyMode ? "privacy-mode" : ""}`}>
          {gameState.guesses.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className={`board-row ${shakeRow === rowIndex ? "shake" : ""}`}
            >
              {row.map((cell, colIndex) => (
                <div
                  key={colIndex}
                  className={`board-cell ${getCellStatus(rowIndex, colIndex)} ${
                    flipRow === rowIndex ? "flip" : ""
                  } ${
                    prefillCells.has(`${rowIndex}-${colIndex}`) ? "prefill" : ""
                  } ${
                    rowIndex === gameState.currentRow &&
                    colIndex === selectedCol &&
                    gameState.gameStatus === "playing"
                      ? "selected"
                      : ""
                  }`}
                  style={{
                    animationDelay:
                      flipRow === rowIndex ? `${colIndex * 300}ms` : 
                      prefillCells.has(`${rowIndex}-${colIndex}`) ? `${colIndex * 100}ms` : "0ms",
                  }}
                  onClick={() => {
                    if (rowIndex === gameState.currentRow) {
                      setSelectedCol(colIndex);
                    }
                  }}
                >
                  {cell}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="keyboard">
          {[
            ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
            ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
            ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
          ].map((row, rowIndex) => (
            <div key={rowIndex} className="keyboard-row">
              {row.map((key) => (
                <button
                  key={key}
                  className={`keyboard-key ${key.length > 1 ? "wide" : ""} ${
                    privacyMode ? "" : getKeyStatus(key)
                  }`}
                  onClick={(e) => {
                    handleKeyPress(key);
                    if (e.detail > 0) e.currentTarget.blur();
                  }}
                >
                  {key === "BACKSPACE" ? "⌫" : key}
                </button>
              ))}
            </div>
          ))}
        </div>
      </main>
      
      <Dialog.Root open={showGameOver} onOpenChange={setShowGameOver}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal">
            <div className="modal-header">
              <Dialog.Title asChild>
                <h2>{gameState.gameStatus === 'won' ? 'Congratulations!' : 'Game Over'}</h2>
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="close-button">×</button>
              </Dialog.Close>
            </div>
            <div className="stats-content">
              <div className="game-over-content">
                {gameState.gameStatus === "won" ? (
                  <p>
                    You guessed the word <strong>{gameState.solution}</strong>{" "}
                    in {gameState.currentRow} {gameState.currentRow === 1 ? 'try' : 'tries'}!
                  </p>
                ) : (
                  <p>
                    Better luck next time! The word was{" "}
                    <strong>{gameState.solution}</strong>.
                  </p>
                )}
                <div className="game-over-buttons">
                  <button 
                    onClick={(e) => {
                      handleShare();
                      if (e.detail > 0) e.currentTarget.blur();
                    }} 
                    className="copy-button"
                  >
                    Copy Results
                  </button>
                  <button
                    onClick={(e) => {
                      resetGame();
                      setShowGameOver(false);
                      if (e.detail > 0) e.currentTarget.blur();
                    }}
                    className="reset-button"
                  >
                    Play Again
                  </button>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      
      {toastMessage && (
        <div className="toast">
          {toastMessage}
        </div>
      )}
    </div>
  );
}