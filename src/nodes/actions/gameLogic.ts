/**
 * Game logic nodes for testing human-in-the-loop functionality
 */

import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { RegisterNode } from '../registry';

/**
 * Initialize a number guessing game
 */
@RegisterNode
export class InitializeGameNode implements Node {
  metadata: NodeMetadata = {
    name: 'initializeGame',
    description: 'Initialize a number guessing game',
    type: 'action',
    ai_hints: {
      purpose: 'Set up a new number guessing game',
      when_to_use: 'At the start of a guessing game workflow',
      expected_edges: ['initialized'],
      example_usage: 'Use to generate a random number and reset game state'
    }
  };

  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    // Get game configuration
    const min = context.config?.min || 1;
    const max = context.config?.max || 100;
    const maxAttempts = context.config?.maxAttempts || 10;
    
    // Generate random number
    const secretNumber = Math.floor(Math.random() * (max - min + 1)) + min;
    
    // Initialize game state
    context.state.set('game', {
      secretNumber,
      min,
      max,
      attempts: 0,
      maxAttempts,
      guesses: [],
      won: false,
      gameOver: false
    });
    
    context.state.set('message', `I'm thinking of a number between ${min} and ${max}. You have ${maxAttempts} attempts to guess it!`);
    
    return {
      initialized: () => ({
        gameStarted: true,
        range: { min, max },
        maxAttempts
      })
    };
  }
}

/**
 * Check a player's guess
 */
@RegisterNode
export class CheckGuessNode implements Node {
  metadata: NodeMetadata = {
    name: 'checkGuess',
    description: 'Check if a guess is correct',
    type: 'action',
    ai_hints: {
      purpose: 'Evaluate a player\'s guess against the secret number',
      when_to_use: 'After receiving a guess from the player',
      expected_edges: ['correct', 'tooHigh', 'tooLow', 'gameOver'],
      example_usage: 'Use to process each guess and determine game continuation'
    }
  };

  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const game = context.state.get('game');
    let guess = context.state.get('currentGuess');
    
    // If currentGuess is not set, try to get it from userInput or lastInput
    if (!guess) {
      const userInput = context.state.get('userInput');
      const lastInput = context.state.get('lastInput');
      guess = userInput?.guess || lastInput?.guess;
    }
    
    if (!game || !guess) {
      return {
        error: () => ({ message: 'Game not initialized or no guess provided' })
      };
    }
    
    // Increment attempts and add guess to history
    game.attempts++;
    game.guesses.push(guess);
    
    // Check if guess is correct
    if (guess === game.secretNumber) {
      game.won = true;
      game.gameOver = true;
      context.state.set('message', `🎉 Congratulations! You guessed the number ${game.secretNumber} in ${game.attempts} attempts!`);
      context.state.set('game', game);
      
      return {
        correct: () => ({
          attempts: game.attempts,
          number: game.secretNumber
        })
      };
    }
    
    // Check if max attempts reached
    if (game.attempts >= game.maxAttempts) {
      game.gameOver = true;
      context.state.set('message', `😢 Game over! The number was ${game.secretNumber}. You used all ${game.maxAttempts} attempts.`);
      context.state.set('game', game);
      
      return {
        gameOver: () => ({
          reason: 'maxAttemptsReached',
          secretNumber: game.secretNumber,
          attempts: game.attempts
        })
      };
    }
    
    // Provide hint
    if (guess > game.secretNumber) {
      context.state.set('message', `Too high! Try a lower number. Attempts remaining: ${game.maxAttempts - game.attempts}`);
      context.state.set('game', game);
      
      return {
        tooHigh: () => ({
          guess,
          attemptsRemaining: game.maxAttempts - game.attempts
        })
      };
    } else {
      context.state.set('message', `Too low! Try a higher number. Attempts remaining: ${game.maxAttempts - game.attempts}`);
      context.state.set('game', game);
      
      return {
        tooLow: () => ({
          guess,
          attemptsRemaining: game.maxAttempts - game.attempts
        })
      };
    }
  }
}

/**
 * Display game results
 */
@RegisterNode
export class DisplayResultsNode implements Node {
  metadata: NodeMetadata = {
    name: 'displayResults',
    description: 'Display final game results',
    type: 'action',
    ai_hints: {
      purpose: 'Show the final game outcome and statistics',
      when_to_use: 'At the end of a game to show results',
      expected_edges: ['displayed'],
      example_usage: 'Use to provide game summary and statistics'
    }
  };

  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const game = context.state.get('game');
    
    if (!game) {
      return {
        error: () => ({ message: 'No game data available' })
      };
    }
    
    const results = {
      won: game.won,
      secretNumber: game.secretNumber,
      attempts: game.attempts,
      guesses: game.guesses,
      efficiency: game.won ? ((game.maxAttempts - game.attempts + 1) / game.maxAttempts * 100).toFixed(1) + '%' : '0%'
    };
    
    context.state.set('results', results);
    
    // Create summary message
    let summary = `\n🎮 Game Summary:\n`;
    summary += `- Secret Number: ${results.secretNumber}\n`;
    summary += `- Total Attempts: ${results.attempts}\n`;
    summary += `- Your Guesses: ${results.guesses.join(', ')}\n`;
    summary += `- Result: ${results.won ? '🏆 Victory!' : '💔 Defeat'}\n`;
    if (results.won) {
      summary += `- Efficiency: ${results.efficiency}\n`;
    }
    
    context.state.set('summary', summary);
    
    return {
      displayed: () => results
    };
  }
}

// Export node instances
export const initializeGame = new InitializeGameNode();
export const checkGuess = new CheckGuessNode();
export const displayResults = new DisplayResultsNode();