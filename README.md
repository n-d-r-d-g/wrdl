# wrdl

wrdl is a [Wordle](https://www.nytimes.com/games/wordle/index.html) clone built with React and TypeScript. Test your vocabulary skills by guessing a 5-letter word in 6 tries or less!

**This project was entirely vibe coded as part of a course.**

![alt text](public/preview.png)

## Features

- **Classic Wordle gameplay** - Guess the 5-letter word with color-coded feedback
- **Daily Word Mode** - Official daily word with zero-knowledge proof validation and day tracking
- **Practice Mode** - Unlimited practice rounds with random words
- **Lightning Mode** - Automatically prefills correct letters in subsequent guesses for faster gameplay
- **Theme options** - Light, dark, and system theme support with persistent preferences
- **Privacy mode** - Hide the game board and keyboard colors to avoid peeking
- **Advanced keyboard navigation** - Full keyboard support with arrow key letter navigation
- **Share results** - Copy formatted game results with emoji grid to share with friends
- **Smart letter placement** - Navigate to any position and modify letters individually
- **Toast notifications** - Helpful messages for invalid words, errors, and confirmations
- **Word validation** - Comprehensive word list checking with helpful error messages
- **Duplicate guess prevention** - Prevents submitting the same word twice

## How to Play

1. Guess a 5-letter word by typing letters
2. Press Enter to submit your guess
3. Green letters are in the correct position
4. Yellow letters are in the word but in the wrong position
5. Gray letters are not in the word
6. You have 6 attempts to find the correct word

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

Built with Vite, React, and TypeScript.
