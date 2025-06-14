import { NextRequest, NextResponse } from 'next/server';
import { getTodaysWordCached } from '../../../lib/word-cache';

export async function POST(request: NextRequest) {
  try {
    const { date } = await request.json();
    
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    // Use the cached word system - this will check cache first, then detect if needed
    const word = await getTodaysWordCached();
    
    return NextResponse.json({ 
      word: word,
      date: date,
      cached: true // Indicate this came from our caching system
    });
    
  } catch (error) {
    console.error('Error in wordle-detector API:', error);
    return NextResponse.json({ 
      error: 'Failed to get word of the day' 
    }, { status: 500 });
  }
}