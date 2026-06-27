const axios = require('axios');
const logger = require('../utils/logger');

const WHAT3WORDS_API_KEY = process.env.WHAT3WORDS_API_KEY;
const BASE_URL = 'https://api.what3words.com/v3';

/**
 * Converts a 3-word address to latitude and longitude coordinates.
 * @param {string} words - The 3-word address (e.g. "filled.count.soap" or "///filled.count.soap")
 * @returns {Promise<{lat: number, lng: number, country: string, nearestPlace: string}>}
 */
async function convertToCoordinates(words) {
  try {
    if (!WHAT3WORDS_API_KEY) {
      throw new Error('what3words API key not configured');
    }

    // Clean up slash prefixes if present
    const cleanWords = words.replace(/^(m|M|)\/\/\//, '').trim();

    const response = await axios.get(`${BASE_URL}/convert-to-coordinates`, {
      params: {
        words: cleanWords,
        key: WHAT3WORDS_API_KEY
      }
    });

    const { coordinates, country, nearestPlace } = response.data;
    return {
      lat: coordinates.lat,
      lng: coordinates.lng,
      country,
      nearestPlace
    };
  } catch (error) {
    logger.error('what3words conversion error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'Failed to resolve what3words address');
  }
}

/**
 * Converts latitude and longitude coordinates to a 3-word address.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{words: string, country: string, nearestPlace: string}>}
 */
async function convertTo3words(lat, lng) {
  try {
    if (!WHAT3WORDS_API_KEY) {
      throw new Error('what3words API key not configured');
    }

    const response = await axios.get(`${BASE_URL}/convert-to-3words`, {
      params: {
        coordinates: `${lat},${lng}`,
        key: WHAT3WORDS_API_KEY
      }
    });

    const { words, country, nearestPlace } = response.data;
    return {
      words: `///${words}`,
      country,
      nearestPlace
    };
  } catch (error) {
    logger.error('what3words reverse conversion error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'Failed to convert coordinates to 3-word address');
  }
}

module.exports = {
  convertToCoordinates,
  convertTo3words
};
