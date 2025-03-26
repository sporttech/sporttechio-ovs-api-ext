/**
 * Splits an array into chunks of specified size
 * @param {Array} array - The array to be chunked
 * @param {number} chunkSize - Size of each chunk
 * @returns {Array} Array of chunks
 */
export function chunk(array, chunkSize) {
    const res = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        const chunk = array.slice(i, i + chunkSize);
        res.push(chunk);
    }
    return res;
}

/**
 * Converts an object with numeric keys to array, filling gaps with default value
 * @param {Object} obj - Object with numeric keys
 * @param {*} defaultValue - Value to fill gaps with
 * @returns {Array} Resulting array
 */
export function objectToArray(obj, defaultValue = null) {
    if (!obj) return [];
    
    const maxIndex = Math.max(...Object.keys(obj).map(Number));
    return Array.from({ length: maxIndex + 1 }, (_, index) => 
        obj[index] !== undefined ? obj[index] : defaultValue
    );
} 