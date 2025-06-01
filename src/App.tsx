import { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import './App.css'

interface GameState {
  currentRow: number
  currentCol: number
  guesses: string[][]
  gameStatus: 'playing' | 'won' | 'lost'
  solution: string
}

interface GameStats {
  gamesPlayed: number
  gamesWon: number
  currentStreak: number
  maxStreak: number
  guessDistribution: number[]
}

const WORD_LENGTH = 5
const MAX_GUESSES = 6

// Simple word list for demo - in a real app you'd load this from an API
const WORDS = [
  'REACT', 'CHESS', 'MAPLE', 'CRANE', 'SLATE', 'ADIEU', 'AUDIO', 'HOUSE',
  'PLANT', 'SMILE', 'BREAD', 'LIGHT', 'WATER', 'BEACH', 'MUSIC', 'CLOUD'
]

function App() {
  const [gameState, setGameState] = useState<GameState>(() => ({
    currentRow: 0,
    currentCol: 0,
    guesses: Array(MAX_GUESSES).fill(null).map(() => Array(WORD_LENGTH).fill('')),
    gameStatus: 'playing',
    solution: WORDS[Math.floor(Math.random() * WORDS.length)]
  }))

  const [themePreference, setThemePreference] = useState<'light' | 'dark' | 'system'>(() => {
    const savedTheme = localStorage.getItem('wordle-theme')
    return (savedTheme as 'light' | 'dark' | 'system') || 'system'
  })
  const [showStats, setShowStats] = useState(false)
  const [showGameOver, setShowGameOver] = useState(false)
  const [stats, setStats] = useState<GameStats>(() => {
    const saved = localStorage.getItem('wordle-stats')
    return saved ? JSON.parse(saved) : {
      gamesPlayed: 0,
      gamesWon: 0,
      currentStreak: 0,
      maxStreak: 0,
      guessDistribution: [0, 0, 0, 0, 0, 0]
    }
  })
  const [shakeRow, setShakeRow] = useState<number | null>(null)
  const [flipRow, setFlipRow] = useState<number | null>(null)

  const getCellStatus = (row: number, col: number): string => {
    if (row > gameState.currentRow) return 'empty'
    if (row === gameState.currentRow) return 'current'
    
    const letter = gameState.guesses[row][col]
    const solution = gameState.solution
    
    if (solution[col] === letter) return 'correct'
    if (solution.includes(letter)) return 'present'
    return 'absent'
  }

  const updateStats = useCallback((guessCount: number) => {
    const newStats = { ...stats }
    newStats.gamesPlayed++
    
    if (guessCount > 0) {
      newStats.gamesWon++
      newStats.currentStreak++
      newStats.maxStreak = Math.max(newStats.maxStreak, newStats.currentStreak)
      newStats.guessDistribution[guessCount - 1]++
    } else {
      newStats.currentStreak = 0
    }
    
    setStats(newStats)
    localStorage.setItem('wordle-stats', JSON.stringify(newStats))
  }, [stats])

  const handleKeyPress = useCallback((key: string) => {
    if (gameState.gameStatus !== 'playing') return

    if (key === 'ENTER') {
      if (gameState.currentCol !== WORD_LENGTH) return
      
      const currentGuess = gameState.guesses[gameState.currentRow].join('')
      
      // Simple word validation (in real app, check against dictionary)
      if (currentGuess.length !== WORD_LENGTH) return
      
      const newGameState = { ...gameState }
      
      if (currentGuess === gameState.solution) {
        newGameState.gameStatus = 'won'
      } else if (gameState.currentRow === MAX_GUESSES - 1) {
        newGameState.gameStatus = 'lost'
      }
      
      newGameState.currentRow++
      newGameState.currentCol = 0
      
      setGameState(newGameState)
      
      // Trigger flip animation
      setFlipRow(gameState.currentRow)
      setTimeout(() => setFlipRow(null), 600)
      
      // Update stats and show game over modal
      if (currentGuess === gameState.solution || gameState.currentRow === MAX_GUESSES - 1) {
        updateStats(currentGuess === gameState.solution ? gameState.currentRow + 1 : 0)
        setTimeout(() => setShowGameOver(true), 1000) // Show after animation
      }
    } else if (key === 'BACKSPACE') {
      if (gameState.currentCol === 0) return
      
      const newGuesses = [...gameState.guesses]
      newGuesses[gameState.currentRow][gameState.currentCol - 1] = ''
      
      setGameState({
        ...gameState,
        guesses: newGuesses,
        currentCol: gameState.currentCol - 1
      })
    } else if (key.match(/^[A-Z]$/) && gameState.currentCol < WORD_LENGTH) {
      const newGuesses = [...gameState.guesses]
      newGuesses[gameState.currentRow][gameState.currentCol] = key
      
      setGameState({
        ...gameState,
        guesses: newGuesses,
        currentCol: gameState.currentCol + 1
      })
    }
  }, [gameState, updateStats])

  const resetGame = () => {
    setGameState({
      currentRow: 0,
      currentCol: 0,
      guesses: Array(MAX_GUESSES).fill(null).map(() => Array(WORD_LENGTH).fill('')),
      gameStatus: 'playing',
      solution: WORDS[Math.floor(Math.random() * WORDS.length)]
    })
    setShakeRow(null)
    setFlipRow(null)
    setShowGameOver(false)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleKeyPress('ENTER')
      } else if (e.key === 'Backspace') {
        handleKeyPress('BACKSPACE')
      } else if (e.key.match(/^[a-zA-Z]$/)) {
        handleKeyPress(e.key.toUpperCase())
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyPress])

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', themePreference)
  }, [themePreference])

  useEffect(() => {
    localStorage.setItem('wordle-theme', themePreference)
  }, [themePreference])

  return (
    <div className="app">
      <header className="header">
        <div className="header-controls">
          <button onClick={() => setShowStats(true)} className="stats-button">
            📊
          </button>
          <h1>Wordle</h1>
          <button 
            onClick={() => setThemePreference(
              themePreference === 'system' ? 'dark' : 
              themePreference === 'dark' ? 'light' : 'system'
            )} 
            className="dark-mode-toggle"
          >
            {themePreference === 'system' ? '🌗' : themePreference === 'dark' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>
      
      <main className="main">
        <div className="game-board">
          {gameState.guesses.map((row, rowIndex) => (
            <div 
              key={rowIndex} 
              className={`board-row ${shakeRow === rowIndex ? 'shake' : ''}`}
            >
              {row.map((cell, colIndex) => (
                <div
                  key={colIndex}
                  className={`board-cell ${getCellStatus(rowIndex, colIndex)} ${flipRow === rowIndex ? 'flip' : ''}`}
                  style={{ animationDelay: flipRow === rowIndex ? `${colIndex * 100}ms` : '0ms' }}
                >
                  {cell}
                </div>
              ))}
            </div>
          ))}
        </div>
        
        <div className="keyboard">
          {[
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
            ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE']
          ].map((row, rowIndex) => (
            <div key={rowIndex} className="keyboard-row">
              {row.map((key) => (
                <button
                  key={key}
                  className={`keyboard-key ${key.length > 1 ? 'wide' : ''}`}
                  onClick={() => handleKeyPress(key)}
                >
                  {key === 'BACKSPACE' ? '⌫' : key}
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
              <button onClick={() => setShowStats(false)} className="close-button">×</button>
            </div>
            <div className="stats-content">
              <div className="stats-grid">
                <div className="stat">
                  <div className="stat-number">{stats.gamesPlayed}</div>
                  <div className="stat-label">Played</div>
                </div>
                <div className="stat">
                  <div className="stat-number">{stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0}</div>
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
                          width: stats.gamesWon > 0 ? `${(count / Math.max(...stats.guessDistribution)) * 100}%` : '0%'
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
              <h2>{gameState.gameStatus === 'won' ? 'Congratulations!' : 'Game Over'}</h2>
              <button onClick={() => setShowGameOver(false)} className="close-button">×</button>
            </div>
            <div className="stats-content">
              <div className="game-over-content">
                {gameState.gameStatus === 'won' ? (
                  <p>You guessed the word in {gameState.currentRow} tries!</p>
                ) : (
                  <p>The word was: <strong>{gameState.solution}</strong></p>
                )}
                <button onClick={() => { resetGame(); setShowGameOver(false); }} className="reset-button">
                  Play Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App