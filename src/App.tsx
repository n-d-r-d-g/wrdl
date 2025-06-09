import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import "./App.css";
import { isValidWord, getRandomWord } from "./words";
import { Share2, Eye, EyeOff, Sun, Moon, Monitor } from "lucide-react";

interface GameState {
  currentRow: number;
  currentCol: number;
  guesses: string[][];
  gameStatus: "playing" | "won" | "lost";
  solution: string;
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

function App() {
  const [gameState, setGameState] = useState<GameState>(() => ({
    currentRow: 0,
    currentCol: 0,
    guesses: Array(MAX_GUESSES)
      .fill(null)
      .map(() => Array(WORD_LENGTH).fill("")),
    gameStatus: "playing",
    solution: getRandomWord(),
  }));

  const [themePreference, setThemePreference] = useState<
    "light" | "dark" | "system"
  >(() => {
    const savedTheme = localStorage.getItem("wrdl-theme");
    return (savedTheme as "light" | "dark" | "system") || "system";
  });
  const [showStats, setShowStats] = useState(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [stats, setStats] = useState<GameStats>(() => {
    const saved = localStorage.getItem("wrdl-stats");
    return saved
      ? JSON.parse(saved)
      : {
          gamesPlayed: 0,
          gamesWon: 0,
          currentStreak: 0,
          maxStreak: 0,
          guessDistribution: [0, 0, 0, 0, 0, 0],
        };
  });
  const [shakeRow, setShakeRow] = useState<number | null>(null);
  const [flipRow, setFlipRow] = useState<number | null>(null);
  const [keyboardUpdateRow, setKeyboardUpdateRow] = useState<number>(0);
  const [selectedCol, setSelectedCol] = useState<number>(0);

  // Refs to track timeout IDs by key for cleanup
  const timeoutRefs = useRef<Map<string, number>>(new Map());

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

    const guess = gameState.guesses[row];
    const solution = gameState.solution;
    const letter = guess[col];

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

    return status;
  };

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    createTimeout("toast", () => setToastMessage(null), 2000);
  }, []);

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
      localStorage.setItem("wrdl-stats", JSON.stringify(newStats));
    },
    [stats]
  );

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
        if (!isValidWord(currentGuess)) {
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
    [gameState, updateStats, flipRow, selectedCol, showToast]
  );

  const resetGame = () => {
    setGameState({
      currentRow: 0,
      currentCol: 0,
      guesses: Array(MAX_GUESSES)
        .fill(null)
        .map(() => Array(WORD_LENGTH).fill("")),
      gameStatus: "playing",
      solution: getRandomWord(),
    });
    setShakeRow(null);
    setFlipRow(null);
    setShowGameOver(false);
    setKeyboardUpdateRow(0);
    setSelectedCol(0);
  };

  const generateShareText = () => {
    const guessCount =
      gameState.gameStatus === "won" ? gameState.currentRow : "X";
    let shareText = `Wrdl ${guessCount}/6\n\n`;

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
  }, [handleKeyPress]);

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", themePreference);
  }, [themePreference]);

  useEffect(() => {
    localStorage.setItem("wrdl-theme", themePreference);
  }, [themePreference]);

  // Cleanup all timeouts on component unmount
  useEffect(() => {
    return () => {
      clearAllTimeouts();
    };
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="header-controls">
          <button
            onClick={() => setShowGameOver(true)}
            className="share-button"
            disabled={gameState.gameStatus === "playing"}
            title="Share results"
          >
            <Share2 size={20} />
          </button>
          <button
            onClick={() => setPrivacyMode(!privacyMode)}
            className="privacy-toggle"
            title={privacyMode ? "Show game board" : "Hide game board"}
          >
            {privacyMode ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
          <button
            onClick={() =>
              setThemePreference(
                themePreference === "system"
                  ? "dark"
                  : themePreference === "dark"
                  ? "light"
                  : "system"
              )
            }
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
                    rowIndex === gameState.currentRow &&
                    colIndex === selectedCol &&
                    gameState.gameStatus === "playing"
                      ? "selected"
                      : ""
                  }`}
                  style={{
                    animationDelay:
                      flipRow === rowIndex ? `${colIndex * 300}ms` : "0ms",
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
                  onClick={() => handleKeyPress(key)}
                >
                  {key === "BACKSPACE" ? "⌫" : key}
                </button>
              ))}
            </div>
          ))}
        </div>
      </main>

      {showStats && (
        <div className="modal-overlay" onClick={() => setShowStats(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Statistics</h2>
              <button
                onClick={() => setShowStats(false)}
                className="close-button"
              >
                ×
              </button>
            </div>
            <div className="stats-content">
              <div className="stats-grid">
                <div className="stat">
                  <div className="stat-number">{stats.gamesPlayed}</div>
                  <div className="stat-label">Played</div>
                </div>
                <div className="stat">
                  <div className="stat-number">
                    {stats.gamesPlayed > 0
                      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
                      : 0}
                  </div>
                  <div className="stat-label">Win %</div>
                </div>
                <div className="stat">
                  <div className="stat-number">{stats.currentStreak}</div>
                  <div className="stat-label">Current Streak</div>
                </div>
                <div className="stat">
                  <div className="stat-number">{stats.maxStreak}</div>
                  <div className="stat-label">Max Streak</div>
                </div>
              </div>
              <div className="guess-distribution">
                <h3>Guess Distribution</h3>
                {stats.guessDistribution.map((count, index) => (
                  <div key={index} className="distribution-row">
                    <div className="guess-number">{index + 1}</div>
                    <div className="distribution-bar">
                      <div
                        className="distribution-fill"
                        style={{
                          width:
                            stats.gamesWon > 0
                              ? `${
                                  (count /
                                    Math.max(...stats.guessDistribution)) *
                                  100
                                }%`
                              : "0%",
                        }}
                      >
                        {count}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showGameOver && (
        <div className="modal-overlay" onClick={() => setShowGameOver(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {gameState.gameStatus === "won"
                  ? "Congratulations!"
                  : "Game Over"}
              </h2>
              <button
                onClick={() => setShowGameOver(false)}
                className="close-button"
              >
                ×
              </button>
            </div>
            <div className="stats-content">
              <div className="game-over-content">
                {gameState.gameStatus === "won" ? (
                  <p>
                    You guessed the word <strong>{gameState.solution}</strong>{" "}
                    in {gameState.currentRow} tries!
                  </p>
                ) : (
                  <p>
                    Better luck next time! The word was{" "}
                    <strong>{gameState.solution}</strong>.
                  </p>
                )}
                <div className="game-over-buttons">
                  <button onClick={handleShare} className="copy-button">
                    Copy Results
                  </button>
                  <button
                    onClick={() => {
                      resetGame();
                      setShowGameOver(false);
                    }}
                    className="reset-button"
                  >
                    Play Again
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toastMessage && <div className="toast">{toastMessage}</div>}
    </div>
  );
}

export default App;
