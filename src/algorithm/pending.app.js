/**
 * Filters an array of data objects by a specific field and value
 * @param {Array} data - The array of data objects to filter
 * @param {string} field - The field name to filter by
 * @param {*} value - The value to filter for
 * @return {Array} - The filtered data array
 */
export function filterByField(data, field, value) {
    if (!Array.isArray(data)) {
      throw new Error('Data must be an array');
    }
  
    return data.filter(item => {
      if (item === null || typeof item !== 'object') return false;
  
      // Support nested fields like "travelInfo.fullName"
      const keys = field.split('.');
      let current = item;
  
      for (const key of keys) {
        if (!(key in current)) return false;
        current = current[key];
      }
  
      return current === value;
    });
  }
  