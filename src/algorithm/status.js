export function calculateStatusPercentages(bookings) {
    const total = bookings.length;
    const statusCounts = {};
  
    // Count each status
    bookings.forEach(booking => {
      const status = booking.status;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
  
    // Calculate percentages
    const statusPercentages = {};
    for (const [status, count] of Object.entries(statusCounts)) {
      statusPercentages[status] = ((count / total) * 100).toFixed(2); // optional: round to 2 decimals
    }
  
    return statusPercentages;
  }
  